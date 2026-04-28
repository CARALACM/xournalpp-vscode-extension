import * as vscode from 'vscode';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as cp from 'child_process';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export function activate(context: vscode.ExtensionContext) {
    const xoppFs = new XoppFileSystemProvider();
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('xopp-xml', xoppFs, {
            isCaseSensitive: true
        })
    );

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider('xopp-xml-editor.default', new XoppCustomEditorProvider(), {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('xopp-xml-editor.openAsXml', async (uri: vscode.Uri) => {
            if (!uri) {
                return;
            }
            // Create a URI with the custom scheme and append .xml for highlighting
            const xoppXmlUri = uri.with({ 
                scheme: 'xopp-xml',
                path: uri.path + '.xml'
            });
            
            try {
                const doc = await vscode.workspace.openTextDocument(xoppXmlUri);
                await vscode.window.showTextDocument(doc);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to open XOPP as XML: ${e.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('xopp-xml-editor.openInXopp', (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== 'file') {
                return;
            }
            cp.exec(`xournalpp "${uri.fsPath}"`, (err) => {
                if (err) {
                    vscode.window.showErrorMessage(`Failed to open Xournal++: ${err.message}`);
                }
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('xopp-xml-editor.exportAsPdf', async (uri: vscode.Uri) => {
            if (!uri || uri.scheme !== 'file') {
                return;
            }

            const pdfPath = uri.fsPath.replace(/\.xopp$/, '.pdf');
            
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Exporting to PDF...",
                cancellable: false
            }, async () => {
                return new Promise<void>((resolve, reject) => {
                    cp.exec(`xournalpp "${uri.fsPath}" -p "${pdfPath}"`, async (err) => {
                        if (err) {
                            vscode.window.showErrorMessage(`Failed to export PDF: ${err.message}`);
                            reject(err);
                        } else {
                            vscode.window.showInformationMessage(`Exported to ${pdfPath}`);
                            const pdfUri = vscode.Uri.file(pdfPath);
                            
                            try {
                                // This will use the default VS Code handler for PDFs 
                                // (which should be LaTeX Workshop if installed/configured)
                                await vscode.commands.executeCommand('vscode.open', pdfUri);
                            } catch (e) {
                                // Final fallback to system viewer
                                await vscode.env.openExternal(pdfUri);
                            }
                            resolve();
                        }
                    });
                });
            });
        })
    );
}

class XoppFileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this._onDidChangeFile.event;

    watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // We can watch the underlying file if we want, but for now let's keep it simple
        return new vscode.Disposable(() => { });
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const fileUri = uri.with({ scheme: 'file', path: uri.path.replace(/\.xml$/, '') });
        const stat = await vscode.workspace.fs.stat(fileUri);
        return stat;
    }

    readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        throw vscode.FileSystemError.Unavailable('Not supported');
    }

    createDirectory(_uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable('Not supported');
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const fileUri = uri.with({ scheme: 'file', path: uri.path.replace(/\.xml$/, '') });
        const compressedData = await vscode.workspace.fs.readFile(fileUri);
        
        try {
            const decompressed = await gunzip(Buffer.from(compressedData));
            return new Uint8Array(decompressed);
        } catch (e: any) {
            return compressedData;
        }
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean; overwrite: boolean }): Promise<void> {
        const fileUri = uri.with({ scheme: 'file', path: uri.path.replace(/\.xml$/, '') });
        const compressed = await gzip(Buffer.from(content));
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(compressed));
    }

    delete(_uri: vscode.Uri, _options: { recursive: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable('Not supported');
    }

    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable('Not supported');
    }
}

class XoppCustomEditorProvider implements vscode.CustomEditorProvider {
    async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel, _token: vscode.CancellationToken): Promise<void> {
        // Redirect to the virtual XML file
        const xmlUri = document.uri.with({ 
            scheme: 'xopp-xml', 
            path: document.uri.path + '.xml' 
        });

        // Open the virtual XML file in the current column
        await vscode.commands.executeCommand('vscode.open', xmlUri, {
            viewColumn: vscode.ViewColumn.Active,
            preview: false
        });

        // Delay disposal slightly to avoid the "OverlayWebview has been disposed" race condition
        setTimeout(() => {
            webviewPanel.dispose();
        }, 100);
    }

    // These are required by the interface but we don't need them for redirection
    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<vscode.CustomDocument>>();
    readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;
    async backupCustomDocument(_document: vscode.CustomDocument, _context: vscode.CustomDocumentBackupContext, _token: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
        return { id: '', delete: () => { } };
    }
    async openCustomDocument(uri: vscode.Uri, _openContext: vscode.CustomDocumentOpenContext, _token: vscode.CancellationToken): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }
    async revertCustomDocument(_document: vscode.CustomDocument, _token: vscode.CancellationToken): Promise<void> { }
    async saveCustomDocument(_document: vscode.CustomDocument, _token: vscode.CancellationToken): Promise<void> { }
    async saveCustomDocumentAs(_document: vscode.CustomDocument, _destination: vscode.Uri, _token: vscode.CancellationToken): Promise<void> { }
}
