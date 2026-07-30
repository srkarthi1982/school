import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from jose import jwt

from app.core.config import settings
from app.modules.aircraft_viewer.router import _authorize_package
from app.modules.library import aircraft_viewer_packages as packages

SEVEN_ZIP = Path(r"C:\Program Files\7-Zip\7z.exe")


class AircraftViewerPackageValidationTests(unittest.TestCase):
    def test_invalid_configured_seven_zip_path_is_reported(self):
        with patch.object(packages.settings, "SEVEN_ZIP_PATH", r"C:\missing\7z.exe"):
            with self.assertRaises(HTTPException) as raised:
                packages.resolve_seven_zip()
        self.assertEqual(raised.exception.status_code, 503)

    def test_unsupported_extension_is_rejected(self):
        with self.assertRaises(HTTPException):
            packages.prepare_package(b"data", "viewer.zip")

    def test_empty_package_is_rejected(self):
        with self.assertRaises(HTTPException):
            packages.prepare_package(b"", "viewer.exe")

    def test_rejects_unsafe_archive_paths(self):
        for value in ("../index.html", "/index.html", r"C:\index.html", r"\\host\share\index.html"):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                packages._safe_archive_path(value)

    def test_metadata_accepts_safe_html_entrypoint(self):
        value = json.dumps({
            "content_kind": "aircraft_viewer",
            "viewer_package_id": "a" * 32,
            "viewer_entrypoint": "index.html",
        })
        self.assertEqual(packages.parse_aircraft_viewer_metadata(value)["viewer_entrypoint"], "index.html")
        self.assertIsNone(packages.parse_aircraft_viewer_metadata(value.replace("index.html", "../index.html")))

    def test_viewer_session_is_package_scoped_and_carries_entrypoint(self):
        package_id = "a" * 32
        token = jwt.encode({
            "sub": "1", "purpose": "aircraft_viewer", "package_id": package_id,
            "entrypoint": "index.html",
            "exp": datetime.now(timezone.utc) + timedelta(seconds=30),
        }, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        self.assertEqual(_authorize_package(package_id, token)["entrypoint"], "index.html")
        with self.assertRaises(HTTPException):
            _authorize_package("b" * 32, token)

    def _archive(self, root: Path, files: dict[str, str], wrapper: bool = False) -> Path:
        source = root / ("wrapper" if wrapper else "source")
        for relative, content in files.items():
            target = source / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        archive = root / "viewer.exe"
        item = source if wrapper else source / "*"
        subprocess.run([str(SEVEN_ZIP), "a", "-sfx7z.sfx", str(archive), str(item)],
                       check=True, capture_output=True)
        return archive

    @unittest.skipUnless(SEVEN_ZIP.is_file(), "7-Zip is not installed")
    def test_root_and_single_wrapper_sfx_preserve_assets(self):
        for wrapper in (False, True):
            for entrypoint in ("index.htm", "index.html"):
                with self.subTest(wrapper=wrapper, entrypoint=entrypoint):
                    with tempfile.TemporaryDirectory() as temp:
                        root = Path(temp)
                        archive = self._archive(root, {
                            entrypoint: "<html></html>",
                            "css/app.css": "body{}",
                            "js/app.js": "window.loaded=true",
                            "models/aircraft.glb": "model",
                            "wasm/runtime.wasm": "wasm",
                        }, wrapper)
                        package_root = root / "packages"
                        with patch.object(packages, "PACKAGE_ROOT", package_root), \
                             patch.object(packages.settings, "SEVEN_ZIP_PATH", str(SEVEN_ZIP)):
                            prepared = packages.prepare_package(archive.read_bytes(), archive.name)
                            self.assertEqual(prepared.metadata["viewer_entrypoint"], entrypoint)
                            for relative in ("css/app.css", "js/app.js", "models/aircraft.glb", "wasm/runtime.wasm"):
                                self.assertTrue((prepared.final_directory / relative).is_file())
                            packages.delete_package(prepared.package_id)
                            self.assertFalse(prepared.final_directory.exists())

    @unittest.skipUnless(SEVEN_ZIP.is_file(), "7-Zip is not installed")
    def test_nested_viewer_entrypoint_is_detected_and_runtime_files_are_excluded(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = self._archive(root, {
                "resources/app/index.htm": "<html></html>",
                "resources/app/css/app.css": "body{}",
                "resources/app/js/app.js": "window.loaded=true",
                "tourlauncher.exe": "runtime",
                "resources.pak": "runtime",
            })
            package_root = root / "packages"
            with patch.object(packages, "PACKAGE_ROOT", package_root), \
                 patch.object(packages.settings, "SEVEN_ZIP_PATH", str(SEVEN_ZIP)):
                prepared = packages.prepare_package(archive.read_bytes(), archive.name)
                self.assertEqual(prepared.metadata["viewer_entrypoint"], "index.htm")
                self.assertTrue((prepared.final_directory / "css/app.css").is_file())
                self.assertTrue((prepared.final_directory / "js/app.js").is_file())
                self.assertFalse((prepared.final_directory / "tourlauncher.exe").exists())
                self.assertFalse((prepared.final_directory / "resources.pak").exists())

    @unittest.skipUnless(SEVEN_ZIP.is_file(), "7-Zip is not installed")
    def test_missing_index_html_is_rejected_without_orphans(self):
        layouts = {
            "missing": {"readme.txt": "none"},
            "other_html": {"viewer.htm": "viewer"},
        }
        for name, files in layouts.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                archive = self._archive(root, files)
                package_root = root / "packages"
                with patch.object(packages, "PACKAGE_ROOT", package_root), \
                     patch.object(packages.settings, "SEVEN_ZIP_PATH", str(SEVEN_ZIP)), \
                     self.assertRaises(HTTPException):
                    packages.prepare_package(archive.read_bytes(), archive.name)
                self.assertEqual(list(package_root.glob("*")), [])

    @unittest.skipUnless(SEVEN_ZIP.is_file(), "7-Zip is not installed")
    def test_normal_executable_is_rejected_with_clear_message(self):
        normal_exe = Path(
            r"C:\Users\admin\Documents\Ansiversa.com\jai-school\backend\app\private_uploads"
            r"\3DVista\UH-60M - CCP_Windows\tourlauncher.exe"
        )
        if not normal_exe.is_file():
            self.skipTest("Normal executable fixture is unavailable")
        with self.assertRaises(HTTPException) as raised:
            packages.prepare_package(normal_exe.read_bytes(), normal_exe.name)
        self.assertIn("does not contain index.htm or index.html", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
