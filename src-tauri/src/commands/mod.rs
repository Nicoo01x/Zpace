pub mod assets;
pub mod browser;
pub mod capture;
pub mod fs;
pub mod git;
pub mod process;
pub mod pty;
pub mod search;
pub mod speech;
pub mod watch;
pub mod system;
pub mod media;
pub mod taskbar;
pub mod updater;
pub mod island;
pub mod desktop;
pub mod mcp;
pub mod listen;

use std::process::Command;

/// Build a `Command` that never flashes a console window on Windows.
pub fn quiet_command(program: &str) -> Command {
    let cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = cmd;
        cmd.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        return cmd;
    }
    #[cfg(not(windows))]
    {
        cmd
    }
}

/// Decode process output that may be UTF-16LE (e.g. `wsl.exe -l`).
pub fn decode_output(bytes: &[u8]) -> String {
    let looks_utf16 = bytes.len() >= 2 && bytes.iter().skip(1).step_by(2).take(16).all(|b| *b == 0);
    if looks_utf16 {
        let u16s: Vec<u16> = bytes.chunks(2).map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)])).collect();
        String::from_utf16_lossy(&u16s)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}
pub mod usage;
