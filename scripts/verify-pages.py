"""Check the published Pages document and its referenced build assets from a runner."""
import os
import time
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.urls.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and attrs.get('href'):
            self.urls.append(attrs['href'])


def verify(url):
    with urlopen(Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as response:
        assert response.status == 200
        html = response.read().decode()
    assert '<div id="root"></div>' in html, 'Published document is not the GUI build'
    parser = Assets()
    parser.feed(html)
    assert any(asset.endswith('.js') for asset in parser.urls), 'JavaScript bundle missing'
    assert any(asset.endswith('.css') for asset in parser.urls), 'Stylesheet missing'
    for asset in parser.urls:
        resolved = urljoin(url, asset)
        assert urlparse(resolved).netloc == urlparse(url).netloc, 'Unexpected asset host'
        assert urlparse(resolved).path.startswith(urlparse(url).path), 'Incorrect Pages base path'
        with urlopen(resolved, timeout=20) as response:
            assert response.status == 200 and response.read(100), 'Asset unavailable'
    print(f'PASS: published GUI document and {len(parser.urls)} build assets at {url}')


if __name__ == '__main__':
    for attempt in range(12):
        try:
            verify(os.environ['PAGES_URL'])
            break
        except Exception:
            if attempt == 11:
                raise
            time.sleep(5)
