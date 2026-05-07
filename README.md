# Xournal++ XML Editor for VS Code - Vibe Project

This extension allows you to open Xournal++ (`.xopp`) files as XML, edit them, and save them back as compressed `.xopp` files.

## Features

- **Open as XML**: Click any `.xopp` file in the explorer it will open as XML.
- **Live Editing**: Edit the XML content with full syntax highlighting.
- **Transparent Compression**: When you save (Ctrl+S), the extension automatically compresses the XML back into the original `.xopp` file.
- **Open in Xournal++**: Right click on any `.xopp` file and select "Open in Xournal++", it will open the file in Xournal++.
- **Export as PDF**: Right click on any `.xopp` file and select "Export as PDF", it will export and open the file as PDF.

## How it works

The extension registers a custom file system provider (`xopp-xml://`) that:
1. Reads the binary `.xopp` file.
2. Decompresses it using GZip.
3. Serves it to VS Code as a virtual XML file.
4. On save, recompresses the edited XML and writes it back to the disk.

## Requirements

- VS Code 1.75.0 or newer.

## Development

1. Clone the repository.
2. Run `npm install`.
3. Press `F5` to start a new VS Code window with the extension loaded.
4. Open a `.xopp` file and test the context menu.
