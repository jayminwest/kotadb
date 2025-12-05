# UV Scripts Guide

**Source:** https://docs.astral.sh/uv/guides/scripts/
**Scraped:** 2025-12-05

---

## Overview

A Python script is a file intended for standalone execution, e.g., with `python <script>.py`. Using uv ensures script dependencies are managed automatically without manual environment setup.

## Running Scripts Without Dependencies

Simple scripts execute with `uv run`:

```python
print("Hello world")
```

```bash
$ uv run example.py
Hello world
```

Standard library imports require no additional configuration. Arguments pass through directly:

```python
import sys
print(" ".join(sys.argv[1:]))
```

```bash
$ uv run example.py hello world!
hello world!
```

Scripts accept input via stdin:

```bash
$ echo 'print("hello world!")' | uv run -
```

When operating within a project directory (containing `pyproject.toml`), use `--no-project` to skip project installation:

```bash
$ uv run --no-project example.py
```

## Running Scripts With Dependencies

External packages require explicit declaration. The `--with` option handles per-invocation dependencies:

```bash
$ uv run --with rich example.py
```

Version constraints apply using standard syntax:

```bash
$ uv run --with 'rich>12,<13' example.py
```

Multiple dependencies chain through repeated `--with` flags.

## Creating Python Scripts

Initialize scripts with inline metadata:

```bash
$ uv init --script example.py --python 3.12
```

## Declaring Script Dependencies

The inline metadata format allows the dependencies for a script to be declared in the script itself. Use `uv add --script`:

```bash
$ uv add --script example.py 'requests<3' 'rich'
```

This creates a script block with TOML syntax at the file's top:

```python
# /// script
# dependencies = [
#   "requests<3",
#   "rich",
# ]
# ///

import requests
from rich.pretty import pprint
```

uv will automatically create an environment with the dependencies necessary to run the script. Python version requirements integrate similarly:

```python
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
```

**Important:** With inline metadata, project dependencies are ignored automatically; `--no-project` isn't required.

## Using Shebangs for Executability

Add shebangs to create executable scripts without requiring `uv run`:

```bash
#!/usr/bin/env -S uv run --script

print("Hello, world!")
```

Make executable: `chmod +x greet`, then run: `./greet`

Dependencies work identically within shebang scripts:

```bash
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///

import httpx
print(httpx.get("https://example.com"))
```

## Using Alternative Package Indexes

Specify custom indexes during dependency declaration:

```bash
$ uv add --index "https://example.com/simple" --script example.py 'requests<3'
```

This embeds index configuration within inline metadata.

## Locking Dependencies

Create lockfiles explicitly for scripts:

```bash
$ uv lock --script example.py
```

This generates `example.py.lock`. Subsequent operations (`uv run`, `uv add`, `uv export`, `uv tree`) reuse locked versions.

## Improving Reproducibility

Add `exclude-newer` timestamps to limit distribution consideration:

```python
# /// script
# dependencies = ["requests"]
# [tool.uv]
# exclude-newer = "2023-10-16T00:00:00Z"
# ///
```

Timestamps follow RFC 3339 format.

## Using Different Python Versions

Request specific versions per invocation:

```bash
$ uv run --python 3.10 example.py
3.10.15
```

uv will search for and use the required Python version. The Python version will download if it is not installed.

## Using GUI Scripts

Windows `.pyw` files execute through `pythonw`:

```python
from tkinter import Tk, ttk

root = Tk()
root.title("uv")
```

```bash
PS> uv run example.pyw
```

Dependencies integrate naturally with GUI scripts as well.

## Next Steps

Consult the command reference for `uv run` details, or explore running and installing tools with uv.
