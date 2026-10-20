package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

//go:embed print.ps1
var printerScript []byte

func platformPrinter(request printPayload) ([]byte, error) {
	f, e := os.CreateTemp(dataDir, "printer-*.ps1")
	if e != nil {
		return nil, e
	}
	name := f.Name()
	defer os.Remove(name)
	if _, e = f.Write(append([]byte{0xef, 0xbb, 0xbf}, printerScript...)); e != nil {
		f.Close()
		return nil, e
	}
	f.Close()
	b, e := json.Marshal(request)
	if e != nil {
		return nil, e
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", name)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Stdin = bytes.NewReader(b)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, e := cmd.Output()
	out = bytes.TrimPrefix(bytes.TrimSpace(out), []byte{0xef, 0xbb, 0xbf})
	if e != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("A impressora não respondeu no prazo")
		}
		var msg struct{ Error string }
		if json.Unmarshal(out, &msg) == nil && msg.Error != "" {
			return nil, fmt.Errorf("%s", msg.Error)
		}
		return nil, fmt.Errorf("Falha no serviço de impressão do Windows. Verifique o driver e o PowerShell")
	}
	if !json.Valid(out) {
		return nil, fmt.Errorf("Resposta inválida do serviço de impressão")
	}
	return out, nil
}
