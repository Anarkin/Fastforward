!define FASTFORWARD_PATH_SCRIPT "\
$$ErrorActionPreference = 'Stop'; \
$$bin = $$env:FASTFORWARD_BIN.TrimEnd('\'); \
$$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment'); \
$$kind = if ($$key.GetValueNames() -contains 'Path') { $$key.GetValueKind('Path') } else { 'ExpandString' }; \
$$path = [string]$$key.GetValue('Path', '', 'DoNotExpandEnvironmentNames'); \
$$entries = @($$path -split ';'); \
$$others = @($$entries | Where-Object { $$_.TrimEnd('\') -ne $$bin }); \
if ($$env:FASTFORWARD_PATH_CHANGE -eq 'add') { \
  if ($$others.Count -eq $$entries.Count) { \
    $$key.SetValue('Path', $$(if ($$path -eq '' -or $$path.EndsWith(';')) { $$path + $$bin } else { $$path + ';' + $$bin }), $$kind) \
  } \
} elseif ($$others.Count -ne $$entries.Count) { \
  $$key.SetValue('Path', ($$others -join ';'), $$kind) \
}"

!macro fastforwardPath change
  System::Call 'Kernel32::SetEnvironmentVariable(t "FASTFORWARD_BIN", t "$INSTDIR\bin")i'
  System::Call 'Kernel32::SetEnvironmentVariable(t "FASTFORWARD_PATH_CHANGE", t "${change}")i'
  Push $0
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${FASTFORWARD_PATH_SCRIPT}"`
  Pop $0
  Pop $0
  SendMessage 0xFFFF 0x1A 0 "STR:Environment" /TIMEOUT=5000
!macroend

!macro customInstall
  !insertmacro fastforwardPath add
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    !insertmacro fastforwardPath remove
    DeleteRegKey HKCU "Software\Classes\Directory\shell\Fastforward"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Fastforward"
  ${endIf}
!macroend
