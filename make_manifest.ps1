# Builds manifest.json (list of question numbers per unit folder).
# Run via the .bat file. This file is ASCII-only on purpose (Korean chars are built from code points).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root

# pattern: "<number>(beon)_(munje).png"
$word = [string][char]0xBC88 + '_' + [char]0xBB38 + [char]0xC81C
$re = [regex]('^(\d+)' + $word + '\.png$')

$result = [ordered]@{}
$total = 0
Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.png' |
  Where-Object { $_.FullName -notmatch '\\\.' } |
  ForEach-Object {
    $name = $_.Name.Normalize([Text.NormalizationForm]::FormC)
    $m = $re.Match($name)
    if (-not $m.Success) { return }
    $rel = $_.DirectoryName.Substring($root.Length).TrimStart('\').Replace('\', '/')
    $i = $rel.LastIndexOf('/')
    if ($i -le 0) { return }
    $book = $rel.Substring(0, $i)
    $unit = $rel.Substring($i + 1)
    if (-not $result.Contains($book)) { $result[$book] = [ordered]@{} }
    if (-not $result[$book].Contains($unit)) { $result[$book][$unit] = New-Object System.Collections.Generic.List[int] }
    $result[$book][$unit].Add([int]$m.Groups[1].Value)
    $total++
  }

$bookParts = foreach ($book in $result.Keys) {
  $unitParts = foreach ($unit in $result[$book].Keys) {
    $nums = ($result[$book][$unit] | Sort-Object) -join ','
    '"' + $unit + '":[' + $nums + ']'
  }
  Write-Host ("  " + $book + " : " + ($result[$book].Keys -join ', '))
  '"' + $book + '":{' + ($unitParts -join ',') + '}'
}
$json = '{' + ($bookParts -join ',') + '}'
[IO.File]::WriteAllText((Join-Path $root 'manifest.json'), $json)

Write-Host ""
Write-Host ("  OK! " + $total + " questions -> manifest.json")
