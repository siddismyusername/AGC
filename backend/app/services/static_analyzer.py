"""
Python Static Code Analyzer
Parses Python source files using the AST module to extract:
- Modules
- Classes
- Import dependencies (from/import statements)
Builds a dependency graph structure ready for Neo4j storage.
"""
from __future__ import annotations

import ast
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import fnmatch


@dataclass
class ModuleInfo:
    """Represents a parsed Python module."""
    name: str
    file_path: str
    line_number: int = 1
    classes: list[str] = field(default_factory=list)
    functions: list[str] = field(default_factory=list)
    imports: list[ImportInfo] = field(default_factory=list)


@dataclass
class ImportInfo:
    """Represents a single import statement."""
    module: str                     # What is being imported
    alias: Optional[str] = None    # Import alias (if any)
    names: list[str] = field(default_factory=list)  # Specific names imported (from X import a, b)
    line_number: int = 0
    import_statement: str = ""     # Raw import text


@dataclass
class DependencyEdge:
    """An edge in the dependency graph."""
    source_module: str
    target_module: str
    import_statement: str
    file_path: str
    line_number: int


@dataclass
class AnalysisResult:
    """Complete result of analyzing a codebase."""
    modules: list[ModuleInfo]
    dependencies: list[DependencyEdge]
    cycles: list[list[str]]
    stats: dict

    def to_dict(self) -> dict:
        return {
            "modules": [
                {
                    "name": m.name,
                    "file_path": m.file_path,
                    "line_number": m.line_number,
                    "classes": m.classes,
                    "functions": m.functions,
                    "import_count": len(m.imports),
                }
                for m in self.modules
            ],
            "dependencies": [
                {
                    "source": d.source_module,
                    "target": d.target_module,
                    "import_statement": d.import_statement,
                    "file_path": d.file_path,
                    "line_number": d.line_number,
                }
                for d in self.dependencies
            ],
            "cycles": self.cycles,
            "stats": self.stats,
        }


class PythonAnalyzer:
    """Analyzes Python source code to build a dependency graph."""

    def __init__(
        self,
        root_path: str,
        include_patterns: list[str] | None = None,
        exclude_patterns: list[str] | None = None,
    ):
        self.root_path = Path(root_path)
        self.include_patterns = include_patterns or ["**/*.py"]
        self.exclude_patterns = exclude_patterns or [
            "**/tests/**",
            "**/test_*",
            "**/__pycache__/**",
            "**/migrations/**",
            "**/venv/**",
            "**/.venv/**",
            "**/node_modules/**",
        ]
        self.modules: dict[str, ModuleInfo] = {}
        self.dependencies: list[DependencyEdge] = []

    def analyze(self) -> AnalysisResult:
        """Run the full analysis pipeline."""
        # 1. Discover Python files
        python_files = self._discover_files()

        # 2. Parse each file
        for file_path in python_files:
            self._parse_file(file_path)

        # 3. Resolve dependencies (map imports to known modules)
        self._resolve_dependencies()

        # 4. Detect cycles
        cycles = self._detect_cycles()

        # 5. Build result
        return AnalysisResult(
            modules=list(self.modules.values()),
            dependencies=self.dependencies,
            cycles=cycles,
            stats={
                "total_files_scanned": len(python_files),
                "total_modules": len(self.modules),
                "total_classes": sum(len(m.classes) for m in self.modules.values()),
                "total_functions": sum(len(m.functions) for m in self.modules.values()),
                "total_dependencies": len(self.dependencies),
                "cycles_detected": len(cycles),
            },
        )

    def _discover_files(self) -> list[Path]:
        """Find all Python files matching include/exclude patterns."""
        all_files = []

        for pattern in self.include_patterns:
            for file_path in self.root_path.rglob(pattern.replace("**/", "")):
                if file_path.is_file():
                    rel_path = str(file_path.relative_to(self.root_path))
                    # Check excludes
                    excluded = False
                    for exc in self.exclude_patterns:
                        if fnmatch.fnmatch(rel_path, exc) or fnmatch.fnmatch(str(file_path), exc):
                            excluded = True
                            break
                    if not excluded:
                        all_files.append(file_path)

        return sorted(set(all_files))

    def _file_to_module_name(self, file_path: Path) -> str:
        """Convert file path to Python module name."""
        rel = file_path.relative_to(self.root_path)
        parts = list(rel.parts)

        # Remove .py extension
        if parts[-1].endswith(".py"):
            parts[-1] = parts[-1][:-3]

        # Remove __init__ (represents the package itself)
        if parts[-1] == "__init__":
            parts = parts[:-1]

        return ".".join(parts) if parts else str(rel)

    def _parse_file(self, file_path: Path) -> None:
        """Parse a single Python file and extract its structure."""
        try:
            source = file_path.read_text(encoding="utf-8", errors="ignore")
            tree = ast.parse(source, filename=str(file_path))
        except (SyntaxError, UnicodeDecodeError):
            return  # Skip files that can't be parsed

        module_name = self._file_to_module_name(file_path)
        rel_path = str(file_path.relative_to(self.root_path))

        module_info = ModuleInfo(
            name=module_name,
            file_path=rel_path,
        )

        for node in ast.walk(tree):
            # Extract classes
            if isinstance(node, ast.ClassDef):
                module_info.classes.append(node.name)

            # Extract top-level functions
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                # Only top-level (not methods inside classes)
                module_info.functions.append(node.name)

            # Extract imports
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    import_info = ImportInfo(
                        module=alias.name,
                        alias=alias.asname,
                        line_number=node.lineno,
                        import_statement=f"import {alias.name}" + (f" as {alias.asname}" if alias.asname else ""),
                    )
                    module_info.imports.append(import_info)

            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    names = [alias.name for alias in (node.names or [])]
                    names_str = ", ".join(names) if names else "*"
                    import_info = ImportInfo(
                        module=node.module,
                        names=names,
                        line_number=node.lineno,
                        import_statement=f"from {node.module} import {names_str}",
                    )
                    module_info.imports.append(import_info)

        self.modules[module_name] = module_info

    def _resolve_dependencies(self) -> None:
        """Match imports to known modules to build dependency edges."""
        known_modules = set(self.modules.keys())

        for module_name, module_info in self.modules.items():
            for imp in module_info.imports:
                target = self._resolve_import(imp.module, known_modules)
                if target and target != module_name:
                    self.dependencies.append(
                        DependencyEdge(
                            source_module=module_name,
                            target_module=target,
                            import_statement=imp.import_statement,
                            file_path=module_info.file_path,
                            line_number=imp.line_number,
                        )
                    )

    def _resolve_import(self, import_path: str, known_modules: set[str]) -> str | None:
        """
        Try to resolve an import path to a known module.
        e.g., 'app.services.user_service' → check if it's in known_modules.
        Also tries parent packages.
        """
        # Direct match
        if import_path in known_modules:
            return import_path

        # Try progressively shorter paths (package-level matching)
        parts = import_path.split(".")
        for i in range(len(parts) - 1, 0, -1):
            candidate = ".".join(parts[:i])
            if candidate in known_modules:
                return candidate

        return None  # External dependency — not in our codebase

    def _detect_cycles(self) -> list[list[str]]:
        """Detect circular dependencies using DFS."""
        # Build adjacency list
        graph: dict[str, set[str]] = {}
        for dep in self.dependencies:
            graph.setdefault(dep.source_module, set()).add(dep.target_module)

        visited: set[str] = set()
        rec_stack: set[str] = set()
        cycles: list[list[str]] = []

        def dfs(node: str, path: list[str]) -> None:
            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in graph.get(node, set()):
                if neighbor not in visited:
                    dfs(neighbor, path)
                elif neighbor in rec_stack:
                    # Found cycle
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    cycles.append(cycle)

            path.pop()
            rec_stack.discard(node)

        for node in graph:
            if node not in visited:
                dfs(node, [])

        return cycles


# ── Convenience function ──

def analyze_python_project(
    root_path: str,
    include_patterns: list[str] | None = None,
    exclude_patterns: list[str] | None = None,
) -> AnalysisResult:
    """Analyze a Python project and return the dependency structure."""
    analyzer = PythonAnalyzer(root_path, include_patterns, exclude_patterns)
    return analyzer.analyze()
