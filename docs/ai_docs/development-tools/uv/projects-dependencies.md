# UV Projects - Managing Dependencies

**Source:** https://docs.astral.sh/uv/guides/projects/#managing-dependencies
**Date:** 2025-12-05

## Overview

uv facilitates management of Python projects that define dependencies through a `pyproject.toml` file.

## Creating a New Project

Initialize projects using the `uv init` command:

```bash
$ uv init hello-world
$ cd hello-world
```

Or initialize in an existing directory:

```bash
$ mkdir hello-world
$ cd hello-world
$ uv init
```

This generates:
- `.gitignore`
- `.python-version`
- `README.md`
- `main.py` (containing sample "Hello world" program)
- `pyproject.toml`

Execute the sample with:

```bash
$ uv run main.py
Hello from hello-world!
```

## Project Structure

A complete project layout includes:

```
.
├── .venv
│   ├── bin
│   ├── lib
│   └── pyvenv.cfg
├── .python-version
├── README.md
├── main.py
├── pyproject.toml
└── uv.lock
```

### pyproject.toml

Contains project metadata:

```toml
[project]
name = "hello-world"
version = "0.1.0"
description = "Add your description here"
readme = "README.md"
dependencies = []
```

Used for specifying dependencies, descriptions, licenses, and uv configuration options via `[tool.uv]` sections.

### .python-version

Specifies the project's default Python version for virtual environment creation.

### .venv

Isolated Python environment where uv installs project dependencies, separate from system Python.

### uv.lock

Cross-platform lockfile containing exact resolved dependency versions. This human-readable TOML file tracks installed versions and should be version-controlled for reproducible installations across machines. Managed by uv—avoid manual editing.

## Managing Dependencies

### Adding Dependencies

Add packages with `uv add`:

```bash
$ uv add requests
```

Specify version constraints:

```bash
$ uv add 'requests==2.31.0'
```

Add from Git repositories:

```bash
$ uv add git+https://github.com/psf/requests
```

Migrate from `requirements.txt`:

```bash
$ uv add -r requirements.txt -c constraints.txt
```

### Removing Dependencies

```bash
$ uv remove requests
```

### Upgrading Packages

```bash
$ uv lock --upgrade-package requests
```

This updates specified packages to latest compatible versions while preserving remaining lockfile entries.

## Viewing Your Version

### Get Full Version Information

```bash
$ uv version
hello-world 0.7.0
```

### Short Format

```bash
$ uv version --short
0.7.0
```

### JSON Output

```bash
$ uv version --output-format json
{
    "package_name": "hello-world",
    "version": "0.7.0",
    "commit_info": null
}
```

## Running Commands

### Using uv run

Execute scripts or commands in your project environment:

```bash
$ uv add flask
$ uv run -- flask run -p 3000
```

Run Python scripts:

```python
# example.py
import flask

print("hello world")
```

```bash
$ uv run example.py
```

**Key behavior:** uv verifies lockfile alignment with `pyproject.toml` and environment synchronization before each invocation, ensuring consistent, reproducible execution.

### Manual Environment Activation

Alternatively, manually sync and activate:

**macOS and Linux:**
```bash
$ uv sync
$ source .venv/bin/activate
$ flask run -p 3000
$ python example.py
```

**Windows:**
```powershell
PS> uv sync
PS> .venv\Scripts\activate
PS> flask run -p 3000
PS> python example.py
```

Note: Virtual environment activation varies by shell and platform.

## Building Distributions

Create source and binary distributions:

```bash
$ uv build
$ ls dist/
hello-world-0.1.0-py3-none-any.whl
hello-world-0.1.0.tar.gz
```

Builds are placed in `dist/` subdirectory by default.

## Next Steps

- Explore the [projects concept documentation](https://docs.astral.sh/uv/concepts/projects/)
- Review the [command reference](https://docs.astral.sh/uv/reference/cli/#uv)
- Learn about [exporting lockfiles to different formats](https://docs.astral.sh/uv/concepts/projects/export/)
