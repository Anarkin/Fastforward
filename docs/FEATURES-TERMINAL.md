# FEATURES

- What a terminal can do, and how much of it Fastforward does

- Fastforward: ✅ Yes, 🟡 Partial, ❌ No

- Tier, a judgement call from what Windows Terminal, iTerm2, WezTerm, kitty, Ghostty, Alacritty, Warp and VS Code's terminal offer: Core is in nearly every terminal, Common in most, Advanced in a few, Niche in one or two, if any

- The sequence is the escape sequence or variable programs use for the feature, where there is one; much of what they ask for is done by `xterm.js` itself, and the notes say so

## Shells

| Feature          | What it does                                               | Sequence                            | Tier     | Fastforward | Notes                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------- | ----------------------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default shell    | Start the user's shell                                     | —                                   | Core     | ✅ Yes      | PowerShell 7 when it is on the PATH, else Windows PowerShell; on macOS `$SHELL` as a login shell, else zsh; on Linux `$SHELL`, else `/bin/sh`                                                |
| Choose the shell | Run another shell, with its arguments                      | —                                   | Core     | ✅ Yes      | `tools.terminal.shell` and `tools.terminal.shellArgs` in the settings, the same for every tab                                                                                                |
| Profiles         | Keep several shells, each with its own settings, in a menu | —                                   | Common   | ❌ No       | One shell for every tab                                                                                                                                                                      |
| WSL              | List the WSL distributions as shells                       | —                                   | Advanced | ❌ No       | `wsl.exe` as the shell runs the default one                                                                                                                                                  |
| Restart a shell  | Start a new shell once one exits                           | —                                   | Common   | ✅ Yes      | Enter, once the tab says the exit code, or why the shell couldn't start                                                                                                                      |
| Windows console  | Run console programs through ConPTY                        | —                                   | Common   | ✅ Yes      | The ConPTY `node-pty` ships rather than the one of Windows; `xterm.js` is told its build, to reflow lines as ConPTY does                                                                     |
| Environment      | Tell programs what terminal they run in                    | `TERM`, `COLORTERM`, `TERM_PROGRAM` | Common   | ✅ Yes      | `TERM=xterm-256color` outside Windows, `COLORTERM=truecolor`, `TERM_PROGRAM=Fastforward` and `TERM_PROGRAM_VERSION`; Electron's own variables left out, and `LANG` set on macOS when missing |
| SSH              | Keep remote hosts in a list and connect to them            | —                                   | Advanced | ❌ No       | `ssh` runs in the shell                                                                                                                                                                      |
| Serial ports     | Connect to a serial port                                   | —                                   | Niche    | ❌ No       |                                                                                                                                                                                              |

## Tabs and sessions

| Feature                    | What it does                                                       | Sequence          | Tier     | Fastforward | Notes                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------ | ----------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tabs                       | Run shells side by side in tabs                                    | —                 | Core     | ✅ Yes      | The app's tabs, among the git and commander tabs, dragged into any order; New in the Terminal submenu of the + menu starts in the home folder                                                  |
| Recent folders             | Open a shell in a folder worked in before                          | —                 | Advanced | ✅ Yes      | Browse... and the folders worked in most, weighted by how recently, in the Terminal submenu of the + menu, as many as `tabs.recentFolders` says, 15 by default; removed with their X or Delete |
| Open from other tools      | Open a shell in the folder of a file manager, editor or git client | —                 | Common   | ✅ Yes      | Mod+Shift+O in a git or commander tab, `ff <folder>` in a terminal, and Open in Fastforward in the Windows Explorer menu, through the Open With popup                                          |
| New tab in the same folder | Open another shell where this one is                               | —                 | Common   | ❌ No       | Mod+Shift+O offers the other tools only                                                                                                                                                        |
| Folder of the shell        | Know the folder the shell is in                                    | OSC 7, OSC 9;9    | Common   | ✅ Yes      | PowerShell, bash, zsh, fish and the Command Prompt are set up to tell it at each prompt; it names the tab and is where Mod+Shift+O opens                                                       |
| Background shells          | Keep shells running in the tabs not shown                          | —                 | Core     | ✅ Yes      | A headless `xterm.js` keeps each screen, so a tab shown again gets it back whole                                                                                                               |
| Survive a reload           | Keep the shells running while the window's page reloads            | —                 | Niche    | ✅ Yes      | The shells run in a utility process of their own; the page reloads as the settings are saved                                                                                                   |
| Restore after a restart    | Reopen the tabs and their shells once the app starts again         | —                 | Common   | 🟡 Partial  | The tabs come back, each with a new shell in the folder it was last in, without their output                                                                                                   |
| Ask before closing         | Ask before closing a tab, or quitting, while a shell runs          | —                 | Common   | ✅ Yes      | Asks for every terminal tab, whether a command runs or not, and before quitting or restarting to update while one is open                                                                      |
| Crash isolation            | Keep a crash of the shells' process from taking the window         | —                 | Advanced | ✅ Yes      | `node-pty` runs in a utility process; when it stops, the tab shown says so and starts a new shell on Enter, the others once shown again                                                        |
| Heavy output               | Stay responsive while a program prints without end                 | —                 | Common   | ✅ Yes      | The shell is paused while 100,000 characters wait to be drawn, and goes on below 10,000                                                                                                        |
| Split panes                | Show several shells in one tab                                     | —                 | Common   | ❌ No       |                                                                                                                                                                                                |
| Windows of their own       | Open shells in more than one window                                | —                 | Common   | ❌ No       | One window, its tabs shared by every tool                                                                                                                                                      |
| Drop-down window           | Show a terminal from the top of the screen on a hotkey             | —                 | Advanced | ❌ No       |                                                                                                                                                                                                |
| Broadcast input            | Type into several shells at once                                   | —                 | Advanced | ❌ No       |                                                                                                                                                                                                |
| Rename a tab               | Give a tab a name of one's own                                     | —                 | Common   | ❌ No       | Named after the folder of its shell                                                                                                                                                            |
| Title from programs        | Show the title a program sets                                      | OSC 0, OSC 2      | Core     | ❌ No       | Named after the folder of its shell                                                                                                                                                            |
| tmux integration           | Show the windows and panes of tmux as tabs and panes               | tmux control mode | Niche    | ❌ No       |                                                                                                                                                                                                |

## Display

| Feature              | What it does                                            | Sequence                             | Tier     | Fastforward | Notes                                                                                                            |
| -------------------- | ------------------------------------------------------- | ------------------------------------ | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| GPU rendering        | Draw the screen with the GPU                            | —                                    | Common   | ✅ Yes      | `xterm.js`'s WebGL renderer, or the DOM one with `tools.terminal.renderer` or once WebGL is lost                 |
| Font                 | Choose the font, its size and the line height           | —                                    | Core     | ✅ Yes      | The monospace font, size and line height of the settings, as the diff has them, the cells on whole device pixels |
| Zoom                 | Make the text larger or smaller for now                 | —                                    | Common   | ❌ No       |                                                                                                                  |
| Ligatures            | Join characters into the ligatures of the font          | —                                    | Advanced | ❌ No       |                                                                                                                  |
| Colors               | Set the 16 colors, the background, text and selection   | —                                    | Core     | ✅ Yes      | In the settings, for the light and the dark theme, following the theme of the app                                |
| Colors from programs | Let programs change the colors                          | OSC 4, OSC 10, OSC 11, OSC 12        | Common   | ✅ Yes      | By `xterm.js`; what they set is kept when the screen is shown again                                              |
| True color           | Draw 24-bit colors                                      | SGR 38;2, SGR 48;2                   | Core     | ✅ Yes      | By `xterm.js`                                                                                                    |
| Minimum contrast     | Lighten or darken text too close to its background      | —                                    | Advanced | ✅ Yes      | A ratio of 4.5 by default, `tools.terminal.minimumContrastRatio`                                                 |
| Wide characters      | Draw emoji and East Asian characters two cells wide     | —                                    | Core     | ✅ Yes      | The widths of Unicode 11                                                                                         |
| Cursor style         | A block, bar or underline, blinking or steady           | DECSCUSR                             | Common   | 🟡 Partial  | Programs set it, by `xterm.js`; a steady block otherwise, with no setting                                        |
| Synchronized output  | Draw a burst of changes at once rather than as it comes | `CSI ? 2026 h`                       | Advanced | ✅ Yes      | By `xterm.js`                                                                                                    |
| Images               | Show images in the terminal                             | Sixel, iTerm2 images, kitty graphics | Advanced | ❌ No       |                                                                                                                  |
| Transparency         | Make the background see-through, or an image            | —                                    | Common   | ❌ No       |                                                                                                                  |

## Input

| Feature                 | What it does                                         | Sequence                       | Tier     | Fastforward | Notes                                                                                                                                |
| ----------------------- | ---------------------------------------------------- | ------------------------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Copy                    | Copy the selected text                               | —                              | Core     | ✅ Yes      | Mod+C while text is selected, the key reaching the shell otherwise, and Mod+Shift+C                                                  |
| Paste                   | Paste the clipboard                                  | —                              | Core     | ✅ Yes      | Mod+V and Mod+Shift+V                                                                                                                |
| Bracketed paste         | Let the shell tell what is pasted from what is typed | `CSI ? 2004 h`                 | Common   | ✅ Yes      | By `xterm.js`                                                                                                                        |
| Paste warnings          | Ask before pasting several lines or a lot of text    | —                              | Common   | ❌ No       |                                                                                                                                      |
| Copy on select          | Copy what is selected, and paste on a middle click   | —                              | Common   | ❌ No       |                                                                                                                                      |
| Context menu            | Copy, paste and more from a right click              | —                              | Common   | ❌ No       |                                                                                                                                      |
| Selection               | Select words and lines by clicking                   | —                              | Core     | ✅ Yes      | By `xterm.js`: a double click selects a word, a triple click a line                                                                  |
| Keys left to programs   | Send the shell the keys the app doesn't need         | —                              | Core     | ✅ Yes      | Every key but Ctrl+Tab, Ctrl+Shift+Tab, Mod+Shift+T, Mod+Shift+W and Mod+Shift+O reaches the shell, and Mod+C while text is selected |
| Key bindings            | Change the shortcuts                                 | —                              | Common   | ❌ No       |                                                                                                                                      |
| Option as Meta          | Send Option as Meta on macOS                         | —                              | Common   | ❌ No       | Option types characters as macOS has it                                                                                              |
| Full keyboard reporting | Tell programs every key and modifier                 | kitty keyboard protocol        | Advanced | ❌ No       |                                                                                                                                      |
| Input methods           | Compose text with an input method                    | —                              | Core     | ✅ Yes      | By `xterm.js`                                                                                                                        |
| Mouse in programs       | Let programs read clicks, drags and the wheel        | `CSI ? 1000 h`, `CSI ? 1006 h` | Core     | ✅ Yes      | By `xterm.js`; the encoding kept when the screen is shown again                                                                      |
| Drop files              | Drop a file on the terminal to type its path         | —                              | Common   | ❌ No       |                                                                                                                                      |

## Scrollback

| Feature          | What it does                                       | Sequence       | Tier     | Fastforward | Notes                                                                                                                                                          |
| ---------------- | -------------------------------------------------- | -------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrollback       | Keep the lines scrolled off the top                | —              | Core     | ✅ Yes      | 10,000 lines by default, `tools.terminal.scrollback`, up to 100,000                                                                                            |
| Scroll           | Scroll back through the output                     | —              | Core     | ✅ Yes      | The wheel moves `scrolling.wheelRows` rows a notch, 10 by default, gliding with `scrolling.smooth`, while the main screen shows and no program reads the mouse |
| Alternate screen | Keep full-screen programs out of the scrollback    | `CSI ? 1049 h` | Core     | ✅ Yes      | By `xterm.js`                                                                                                                                                  |
| Reflow           | Wrap lines anew when the window is resized         | —              | Common   | ✅ Yes      | By `xterm.js`                                                                                                                                                  |
| Find             | Search the scrollback                              | —              | Core     | ❌ No       |                                                                                                                                                                |
| Clear            | Clear the screen and the scrollback from a command | —              | Common   | ❌ No       | The shell's `clear` and `cls` work                                                                                                                             |
| Save the output  | Save the scrollback as text                        | —              | Advanced | ❌ No       |                                                                                                                                                                |

## Shell integration

| Feature          | What it does                                         | Sequence  | Tier     | Fastforward | Notes                                           |
| ---------------- | ---------------------------------------------------- | --------- | -------- | ----------- | ----------------------------------------------- |
| Command marks    | Mark where each prompt, command and its output start | OSC 133   | Common   | ❌ No       | The shells are set up to tell only their folder |
| Jump to a prompt | Scroll to the previous or next command               | OSC 133   | Advanced | ❌ No       |                                                 |
| Exit status      | Mark the commands that failed                        | OSC 133;D | Advanced | ❌ No       |                                                 |
| Select an output | Select or copy the output of one command             | OSC 133   | Advanced | ❌ No       |                                                 |
| Suggestions      | Suggest commands from the history as one types       | —         | Advanced | ❌ No       |                                                 |

## Links and clipboard

| Feature                 | What it does                    | Sequence | Tier     | Fastforward | Notes                                              |
| ----------------------- | ------------------------------- | -------- | -------- | ----------- | -------------------------------------------------- |
| Links                   | Open the URLs printed           | —        | Common   | ❌ No       |                                                    |
| Hyperlinks              | Open the links programs print   | OSC 8    | Common   | ❌ No       | `xterm.js` underlines them, but nothing opens them |
| File paths              | Open the paths printed          | —        | Advanced | ❌ No       |                                                    |
| Clipboard from programs | Let programs copy, over SSH too | OSC 52   | Common   | ❌ No       |                                                    |

## Notifications

| Feature       | What it does                                    | Sequence       | Tier     | Fastforward | Notes                                 |
| ------------- | ----------------------------------------------- | -------------- | -------- | ----------- | ------------------------------------- |
| Bell          | Sound or flash on a bell                        | BEL            | Core     | ❌ No       | Nothing happens                       |
| Notifications | Show the desktop notifications programs send    | OSC 9, OSC 777 | Advanced | ❌ No       | OSC 9;9 tells the folder of the shell |
| Progress      | Show the progress a program reports on its tab  | OSC 9;4        | Advanced | ❌ No       |                                       |
| Activity      | Mark tabs with new output or a finished command | —              | Advanced | ❌ No       |                                       |

## App

| Feature         | What it does                                | Sequence | Tier     | Fastforward | Notes                                                                                                                  |
| --------------- | ------------------------------------------- | -------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Settings        | Change the settings                         | —        | Common   | 🟡 Partial  | JSON files, applied as saved and checked, no settings page; a new shell or arguments apply to the shells started after |
| Command palette | Find any command by typing                  | —        | Common   | ❌ No       |                                                                                                                        |
| Screen readers  | Read the output to assistive technology     | —        | Common   | ❌ No       | `xterm.js`'s screen reader mode is off                                                                                 |
| Triggers        | Act on text that matches a pattern          | —        | Niche    | ❌ No       |                                                                                                                        |
| Recording       | Record a session to play back               | —        | Niche    | ❌ No       |                                                                                                                        |
| AI              | Explain errors and suggest commands with AI | —        | Advanced | ❌ No       |                                                                                                                        |
