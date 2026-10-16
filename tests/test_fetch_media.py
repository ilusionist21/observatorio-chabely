import os
from contextlib import redirect_stdout
from datetime import datetime
from io import BytesIO, StringIO
import tempfile
import unittest
from unittest.mock import patch

from scripts.fetch_media import PERU_TZ, clear_today_images, fetch_rss_feed


class FetchMediaTest(unittest.TestCase):
    def test_removes_all_images_from_previous_update(self):
        with tempfile.TemporaryDirectory() as images_dir:
            current = "2026-10-15_actual.jpg"
            previous = "2026-10-14_anterior.jpg"
            for filename in (current, previous):
                open(os.path.join(images_dir, filename), "wb").close()

            self.assertEqual(clear_today_images(images_dir), 2)
            self.assertEqual(os.listdir(images_dir), [])

    @patch("scripts.fetch_media.urllib.request.urlopen")
    def test_rss_item_without_content_node_does_not_fail(self, urlopen):
        rss = b"""<rss><channel><item>
            <title>Noticia sin imagen</title>
            <pubDate>Thu, 15 Oct 2026 12:00:00 -0500</pubDate>
            <description />
        </item></channel></rss>"""
        response = BytesIO(rss)
        urlopen.return_value = response

        output = StringIO()
        with redirect_stdout(output):
            items = fetch_rss_feed(
                "https://example.com/feed",
                "Fuente",
                "internacional",
                "Internacional",
                datetime(2026, 10, 15, 13, 0, tzinfo=PERU_TZ),
            )

        self.assertEqual(items, [])
        self.assertNotIn("[!]", output.getvalue())


if __name__ == "__main__":
    unittest.main()
