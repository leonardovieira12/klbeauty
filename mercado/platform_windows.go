package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

func replaceFile(src, dst string) error {
	a, _ := syscall.UTF16PtrFromString(src)
	b, _ := syscall.UTF16PtrFromString(dst)
	r, _, e := syscall.NewLazyDLL("kernel32.dll").NewProc("MoveFileExW").Call(uintptr(unsafe.Pointer(a)), uintptr(unsafe.Pointer(b)), 9)
	if r == 0 {
		return e
	}
	return nil
}
func ps(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
func stageUpdate(b []byte) error {
	exe, e := os.Executable()
	if e != nil {
		return e
	}
	stage := exe + ".update"
	if e = os.WriteFile(stage, b, 0600); e != nil {
		return fmt.Errorf("Sem permissão na pasta do EXE. Mova-o para uma pasta do usuário.")
	}
	script := fmt.Sprintf(`$ErrorActionPreference='Stop'
Wait-Process -Id %d -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
try {
 Copy-Item -LiteralPath %s -Destination %s -Force
 Move-Item -LiteralPath %s -Destination %s -Force
 Start-Process -FilePath %s
} catch {
 if (Test-Path -LiteralPath %s) { Copy-Item -LiteralPath %s -Destination %s -Force }
 $_ | Out-File -LiteralPath %s
}
`, os.Getpid(), ps(exe), ps(exe+".previous"), ps(stage), ps(exe), ps(exe), ps(exe+".previous"), ps(exe+".previous"), ps(exe), ps(filepath.Join(dataDir, "update-error.txt")))
	p := filepath.Join(dataDir, "update.ps1")
	if e = os.WriteFile(p, append([]byte{0xef, 0xbb, 0xbf}, []byte(script)...), 0600); e != nil {
		return e
	}
	c := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", p)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return c.Start()
}

func showError(message string) {
	m, _ := syscall.UTF16PtrFromString(message)
	t, _ := syscall.UTF16PtrFromString("KLSistemas")
	syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
}
