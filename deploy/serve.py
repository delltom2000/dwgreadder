"""Serve bundled application assets only. There is no file-upload endpoint."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

SITE = Path(os.environ.get('READER_SITE', '/app/site')).resolve()

class ReaderHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'application/javascript'}

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_head(self):
        path = Path(self.translate_path(self.path)).resolve()
        if not path.is_relative_to(SITE):
            self.send_error(404)
            return None
        if path.is_dir():
            path = path / 'index.html'
        if not path.is_file():
            self.send_error(404)
            return None
        compressed = path.with_name(path.name + '.gz')
        accepts_gzip = any(part.split(';')[0].strip() == 'gzip' and 'q=0' not in part for part in self.headers.get('Accept-Encoding', '').split(','))
        use_gzip = accepts_gzip and compressed.is_file()
        file = (compressed if use_gzip else path).open('rb')
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Length', str(os.fstat(file.fileno()).st_size))
        self.send_header('Vary', 'Accept-Encoding')
        if use_gzip:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        return file

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '7860'))), partial(ReaderHandler, directory=str(SITE)))
    print('Reader static server ready', flush=True)
    server.serve_forever()
