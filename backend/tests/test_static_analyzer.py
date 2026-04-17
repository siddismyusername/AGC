from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from app.services.static_analyzer import PythonAnalyzer


def _write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_python_analyzer_extracts_modules_dependencies_and_cycles():
    with TemporaryDirectory() as temp_dir:
        root = Path(temp_dir) / "sample_project"
        pkg = root / "pkg"
        pkg.mkdir(parents=True)

        _write(pkg / "__init__.py", "")
        _write(pkg / "app.py", "import pkg.service\n")
        _write(pkg / "service.py", "import pkg.repository\n")
        _write(pkg / "repository.py", "import pkg.app\n")

        analyzer = PythonAnalyzer(root_path=str(root))
        result = analyzer.analyze()

        module_names = {module.name for module in result.modules}
        assert {"pkg", "pkg.app", "pkg.repository", "pkg.service"}.issubset(module_names)

        dependencies = {(edge.source_module, edge.target_module) for edge in result.dependencies}
        assert ("pkg.app", "pkg.service") in dependencies
        assert ("pkg.service", "pkg.repository") in dependencies
        assert ("pkg.repository", "pkg.app") in dependencies

        assert result.stats["total_modules"] == 4
        assert result.stats["cycles_detected"] >= 1
        assert any(cycle[0] == "pkg.app" and cycle[-1] == "pkg.app" for cycle in result.cycles)