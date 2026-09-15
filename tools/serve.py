"""Static file server for developing ZRace, which tells the browser not to cache.

    python tools/serve.py [port]        # default 8000

`python -m http.server` sends no cache headers at all, which leaves a browser free to keep
serving an ES module or a stylesheet it fetched minutes ago. Edit a file, reload, and you
are looking at the old one - and worse, at a mixture, because the page reloads but its
imports do not. A fresh main.js importing a stale carModel.js fails outright with "does
not provide an export named ...", which looks like a code error and is not one.

It also forwards /api/ to the record board on 127.0.0.1:8011 if one is running, which is
what nginx does in front of the deployed game. Without that the board would be the one
thing you could not exercise locally, and "works in dev" would stop meaning much. No
board running is fine: the request 502s, and the game treats that the same as a
deployment that never had one.

    python tools/serve.py 8010                          # the game
    python server/scores.py --port 8011 --db zrace.db    # the board, optionally
"""
import functools
import http.client
import http.server
import os
import sys

API_PREFIX = '/api/'
API_HOST, API_PORT = '127.0.0.1', 8011


class NoStore(http.server.SimpleHTTPRequestHandler):
    def proxy_api(self):
        """Hand the request to the record board and copy its answer back."""
        body = b''
        length = int(self.headers.get('Content-Length') or 0)
        if length:
            body = self.rfile.read(length)
        try:
            conn = http.client.HTTPConnection(API_HOST, API_PORT, timeout=10)
            headers = {'Content-Type': self.headers.get('Content-Type', 'application/json'),
                       'X-Forwarded-For': self.client_address[0]}
            conn.request(self.command, self.path, body=body or None, headers=headers)
            res = conn.getresponse()
            payload = res.read()
            self.send_response(res.status)
            self.send_header('Content-Type', res.getheader('Content-Type', 'application/json'))
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except OSError as err:
            msg = f'{{"error": "no record board on {API_HOST}:{API_PORT}: {err}"}}'.encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_GET(self):
        if self.path.startswith(API_PREFIX):
            return self.proxy_api()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith(API_PREFIX):
            return self.proxy_api()
        self.send_error(405)

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
    print(f'  /api/ -> {API_HOST}:{API_PORT}  (start server/scores.py to use the shared board)')
    try:
        http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
