import os
import tempfile
import unittest

from scripts.fetch_media import clean_old_images


class CleanOldImagesTest(unittest.TestCase):
    def test_removes_only_images_from_previous_days(self):
        with tempfile.TemporaryDirectory() as images_dir:
            current = "2026-10-15_actual.jpg"
            previous = "2026-10-14_anterior.jpg"
            for filename in (current, previous):
                open(os.path.join(images_dir, filename), "wb").close()

            self.assertEqual(clean_old_images("2026-10-15", images_dir), 1)
            self.assertEqual(os.listdir(images_dir), [current])


if __name__ == "__main__":
    unittest.main()
