package main

import "fmt"

func platformPrinter(request printPayload) ([]byte, error) {
	return nil, fmt.Errorf("Impressão direta disponível no computador Windows da impressora; servidor remoto requer uma ponte de impressão local")
}
