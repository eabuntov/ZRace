"""Static file server for developing ZRace, which tells the browser not to cache.

    python tools/serve.py [port]        # default 8000

`python -m http.server` sends no cache headers at all, which leaves a browser free to keep
serving an ES module or a stylesheet it fetched minutes ago. Edit a file, reload, and you
are looking at the old one - and worse, at a mixture, because the page reloads but its
imports do not. A fresh main.js importing a stale carModel.js fails outright with "does
not provide an export named ...", which looks like a code error and is not one.
"""
import functools
import http.server
import os
import sys


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):          # one line per request is plenty
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoStore, directory=root)
    print(f'ZRace on http://localhost:{port}/   (serving {root}, nothing cached)')
    try:
        http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
