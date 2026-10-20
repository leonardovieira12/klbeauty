package main

import (
	"fmt"
	"os"
)

func replaceFile(a, b string) error { return os.Rename(a, b) }
func stageUpdate(b []byte) error    { return fmt.Errorf("Disponível no Windows") }

func showError(message string) { fmt.Fprintln(os.Stderr, message) }
