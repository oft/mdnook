import { spawn } from 'node:child_process'
import { join } from 'node:path'

export interface SystemAuthenticator {
  /** Returns the canonical process-owner name only after OS authentication. */
  authenticate(username: string, password: string): Promise<string | null>
  check?(): Promise<void>
}

export class AuthenticationUnavailable extends Error {
  constructor() { super('系统账号验证不可用，请检查系统认证组件和登录策略') }
}

// Fixed programs receive credentials through stdin, never command arguments or a shell.
const windowsHelper = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class MdnookLogon {
  [DllImport("advapi32.dll", EntryPoint="LogonUserW", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  static extern bool LogonUser(string user, string domain, string password, int type, int provider, out IntPtr token);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);
  public static string Authenticate(string name, string password) {
    using (var owner = WindowsIdentity.GetCurrent()) {
      string user = name, domain = ".";
      int slash = name.IndexOf('\\');
      if (slash >= 0) { domain = name.Substring(0, slash); user = name.Substring(slash + 1); }
      else if (name.Contains("@")) { domain = null; }
      // Resolve and reject other identities before submitting passwords to Windows.
      string qualified = domain == null ? name : (domain == "." ? Environment.MachineName : domain) + "\\" + user;
      SecurityIdentifier sid;
      try { sid = (SecurityIdentifier)new NTAccount(qualified).Translate(typeof(SecurityIdentifier)); }
      catch (IdentityNotMappedException) { return null; }
      if (!sid.Equals(owner.User)) return null;
      IntPtr token;
      if (!LogonUser(user, domain, password, 3, 0, out token)) return null;
      try {
        using (var loggedOn = new WindowsIdentity(token)) {
          return loggedOn.User.Equals(owner.User) ? owner.Name : null;
        }
      } finally { CloseHandle(token); }
    }
  }
}
'@
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($inputData.mode -eq 'check') {
  @{ username = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name } | ConvertTo-Json -Compress
} else {
  @{ username = [MdnookLogon]::Authenticate($inputData.username, $inputData.password) } | ConvertTo-Json -Compress
}
`

const pamHelper = String.raw`
import ctypes as c, ctypes.util, json, os, pwd, sys
data = json.load(sys.stdin)
owner = pwd.getpwuid(os.geteuid())
pam = c.CDLL(ctypes.util.find_library('pam') or ('/usr/lib/libpam.dylib' if sys.platform == 'darwin' else 'libpam.so.0'))
if data['mode'] == 'check':
    print(json.dumps({'username': owner.pw_name}))
    sys.exit(0)
try:
    if pwd.getpwnam(data['username']).pw_uid != owner.pw_uid:
        print(json.dumps({'username': None}))
        sys.exit(0)
except KeyError:
    print(json.dumps({'username': None}))
    sys.exit(0)
class Message(c.Structure):
    _fields_ = [('style', c.c_int), ('message', c.c_char_p)]
class Response(c.Structure):
    _fields_ = [('response', c.c_void_p), ('code', c.c_int)]
Callback = c.CFUNCTYPE(c.c_int, c.c_int, c.POINTER(c.POINTER(Message)), c.POINTER(c.POINTER(Response)), c.c_void_p)
class Conversation(c.Structure):
    _fields_ = [('callback', Callback), ('data', c.c_void_p)]
libc = c.CDLL(ctypes.util.find_library('c') or '/usr/lib/libSystem.B.dylib')
libc.calloc.argtypes = [c.c_size_t, c.c_size_t]
libc.calloc.restype = c.c_void_p
libc.strdup.argtypes = [c.c_char_p]
libc.strdup.restype = c.c_void_p
libc.free.argtypes = [c.c_void_p]
@Callback
def conversation(count, messages, output, unused):
    if count < 1 or count > 32:
        return 1
    memory = libc.calloc(count, c.sizeof(Response))
    if not memory:
        return 1
    responses = c.cast(memory, c.POINTER(Response))
    try:
        for i in range(count):
            style = messages[i].contents.style
            if style in (1, 2):
                value = data['password'] if style == 1 else data['username']
                responses[i].response = libc.strdup(value.encode('utf-8'))
                if not responses[i].response:
                    raise ValueError()
            elif style not in (3, 4):
                raise ValueError()
        output[0] = responses  # PAM owns these allocations after success.
        return 0
    except Exception:
        for i in range(count):
            if responses[i].response:
                libc.free(responses[i].response)
        libc.free(memory)
        return 1
pam.pam_start.argtypes = [c.c_char_p, c.c_char_p, c.POINTER(Conversation), c.POINTER(c.c_void_p)]
pam.pam_authenticate.argtypes = [c.c_void_p, c.c_int]
pam.pam_acct_mgmt.argtypes = [c.c_void_p, c.c_int]
pam.pam_get_item.argtypes = [c.c_void_p, c.c_int, c.POINTER(c.c_void_p)]
pam.pam_end.argtypes = [c.c_void_p, c.c_int]
handle = c.c_void_p()
conv = Conversation(conversation, None)
status = pam.pam_start(b'login', data['username'].encode('utf-8'), c.byref(conv), c.byref(handle))
authenticated = False
if status == 0:
    try:
        status = pam.pam_authenticate(handle, 0x8001)  # SILENT | DISALLOW_NULL_AUTHTOK
        if status == 0:
            status = pam.pam_acct_mgmt(handle, 0x8001)
        if status == 0:
            name = c.c_void_p()
            status = pam.pam_get_item(handle, 2, c.byref(name))  # PAM_USER
            if status == 0 and name.value:
                authenticated = pwd.getpwnam(c.string_at(name).decode('utf-8')).pw_uid == owner.pw_uid
    finally:
        pam.pam_end(handle, status)
print(json.dumps({'username': owner.pw_name if authenticated else None}))
`

function runHelper(input: Record<string, string>): Promise<string | null> {
  const windows = process.platform === 'win32'
  if (!windows && !['linux', 'darwin'].includes(process.platform)) throw new AuthenticationUnavailable()
  const executable = windows
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : '/usr/bin/python3'
  const args = windows
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', windowsHelper]
    : ['-I', '-c', pamHelper]
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new AuthenticationUnavailable()) }, 30000)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      if (output.length > 4096) { child.kill(); reject(new AuthenticationUnavailable()) }
    })
    // Discard helper diagnostics: OS providers can include credential-related content.
    child.stderr.resume()
    child.stdin.on('error', () => { /* The exit/error event handles unavailable helpers. */ })
    child.once('error', () => { clearTimeout(timer); reject(new AuthenticationUnavailable()) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new AuthenticationUnavailable())
      try {
        const result = JSON.parse(output.replace(/^\uFEFF/, '')) as { username: unknown }
        if (result.username !== null && typeof result.username !== 'string') throw new Error()
        resolve(result.username)
      } catch { reject(new AuthenticationUnavailable()) }
    })
    child.stdin.end(JSON.stringify(input))
  })
}

export function createSystemAuthenticator(): SystemAuthenticator {
  return {
    async check() { await runHelper({ mode: 'check' }) },
    authenticate(username, password) { return runHelper({ mode: 'authenticate', username, password }) },
  }
}
