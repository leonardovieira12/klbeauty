$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
 Add-Type -AssemblyName System.Drawing
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 $settings = New-Object System.Drawing.Printing.PrinterSettings
 if ($request.action -eq 'list') {
  $names = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | ForEach-Object { [string]$_ })
  @{printers=$names; defaultPrinter=$settings.PrinterName; supported=$true} | ConvertTo-Json -Compress
  exit 0
 }
 if ($request.printer) { $settings.PrinterName = [string]$request.printer }
 if (-not $settings.IsValid) { throw 'Nenhuma impressora válida. Selecione a térmica em Personalização.' }
 if ($settings.PrinterName -match 'PDF|XPS|OneNote|Fax') { throw 'A impressora selecionada é virtual. Selecione a impressora térmica física em Personalização.' }
 $doc = New-Object System.Drawing.Printing.PrintDocument
 $doc.PrinterSettings = $settings
 $doc.PrinterSettings.Copies = 1
 $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
 $doc.DocumentName = [string]$request.title
 $doc.DefaultPageSettings.Landscape = $false
 $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(8,8,8,8)
 $script:receiptLines = @($request.lines)
 $script:lineIndex = 0
 $width = [int][Math]::Round(([int]$request.width) / 25.4 * 100)
 $height = [int][Math]::Max(160,[Math]::Min(3000,$script:receiptLines.Count*14+35))
 $paper = New-Object System.Drawing.Printing.PaperSize('KLS Cupom', $width, $height)
 $doc.DefaultPageSettings.PaperSize = $paper
 $script:receiptFont = New-Object System.Drawing.Font('Courier New',8,[System.Drawing.FontStyle]::Regular)
 $handler = [System.Drawing.Printing.PrintPageEventHandler] {
  param($sender,$e)
  $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
  $available = [Math]::Min($e.MarginBounds.Width,$e.PageSettings.PrintableArea.Width-12)
  if ($available -lt 40) { throw 'Área imprimível inválida. Configure a bobina de 58 ou 80 mm no driver.' }
  $lineHeight = $script:receiptFont.GetHeight($e.Graphics)+3
  $y = [single]8
  $pageEnd = [Math]::Min($e.PageBounds.Height-16,$e.PageSettings.PrintableArea.Height-8)
  if ($pageEnd -lt $lineHeight+8) { throw 'Altura da página inválida no driver da impressora.' }
  while ($script:lineIndex -lt $script:receiptLines.Count -and $y+$lineHeight -le $pageEnd) {
   $text = [string]$script:receiptLines[$script:lineIndex]
   $font = $script:receiptFont
   $measured = $e.Graphics.MeasureString($text,$font).Width
   $scaled = $null
   if ($measured -gt $available) {
    $scaled = New-Object System.Drawing.Font('Courier New',([single](8*$available/$measured)),[System.Drawing.FontStyle]::Regular)
    $font = $scaled
   }
   $e.Graphics.DrawString($text,$font,[System.Drawing.Brushes]::Black,[single]6,[single]$y)
   if ($scaled) { $scaled.Dispose() }
   $script:lineIndex++
   $y += $lineHeight
  }
  $e.HasMorePages = $script:lineIndex -lt $script:receiptLines.Count
 }
 $doc.add_PrintPage($handler)
 try { $doc.Print() } finally { $doc.remove_PrintPage($handler); $doc.Dispose(); $script:receiptFont.Dispose() }
 @{ok=$true; printer=$settings.PrinterName} | ConvertTo-Json -Compress
} catch {
 @{error=$_.Exception.Message} | ConvertTo-Json -Compress
 exit 1
}
