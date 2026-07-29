#!/usr/bin/env python3
"""
Script to zip the project directory while ignoring files listed in .gitignore.
The zip file is saved one level above the project directory.
Uses only standard library modules.
"""

import os
import zipfile


def read_gitignore(gitignore_path: str) -> set:
    """Read .gitignore file and return a set of patterns to ignore."""
    ignore_patterns = set()
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r') as f:
            for line in f:
                line = line.strip()
                # Skip empty lines and comments
                if line and not line.startswith('#'):
                    ignore_patterns.add(line)
    return ignore_patterns


def should_ignore(file_path: str, base_dir: str, ignore_patterns: set) -> bool:
    """Check if a file should be ignored based on gitignore patterns."""
    # Get relative path from base directory
    rel_path = os.path.relpath(file_path, base_dir)
    rel_path_normalized = rel_path.replace('\\', '/')
    parts = rel_path_normalized.split('/')

    # Always ignore hidden folders: .git, .claude, .idea, .venv, and __pycache__
    if parts and (parts[0] in ('.git', '.claude', '.idea') or
                  (len(parts) >= 2 and parts[0] == 'backend' and parts[1] == '.venv') or
                  (len(parts) >= 2 and parts[0] == 'frontend' and parts[1] == 'node_modules') or
                  '__pycache__' in parts):
        return True

    for pattern in ignore_patterns:
        pattern_normalized = pattern.replace('\\', '/')

        # Handle directory patterns (ending with /)
        if pattern_normalized.endswith('/'):
            pattern_dir = pattern_normalized[:-1]
            # Check if the file is inside this directory
            if rel_path_normalized.startswith(pattern_dir + '/') or rel_path_normalized == pattern_dir:
                return True
        # Handle file patterns (ending with /*)
        elif pattern_normalized.endswith('/*'):
            pattern_prefix = pattern_normalized[:-2]
            # Check if file is directly inside this directory
            rel_dir = os.path.dirname(rel_path_normalized)
            if rel_dir == pattern_prefix or rel_path_normalized.startswith(pattern_prefix + '/'):
                return True
        # Handle basename patterns (no /)
        elif '/' not in pattern_normalized:
            basename = os.path.basename(file_path)
            if basename == pattern_normalized:
                return True
        # Handle path patterns
        else:
            if rel_path_normalized.startswith(pattern_normalized) or rel_path_normalized == pattern_normalized:
                return True

    return False


def zip_project(project_dir: str, output_dir: str, zip_filename: str = None):
    """
    Create a zip file of the project directory, excluding files in .gitignore.

    Args:
        project_dir: Path to the project directory to zip
        output_dir: Path to the directory where the zip file will be saved
        zip_filename: Name of the output zip file (optional)
    """
    # Get absolute paths
    project_dir = os.path.abspath(project_dir)
    output_dir = os.path.abspath(output_dir)

    # Read gitignore patterns
    gitignore_path = os.path.join(project_dir, '.gitignore')
    ignore_patterns = read_gitignore(gitignore_path)

    # Determine output zip filename
    if zip_filename is None:
        project_name = os.path.basename(project_dir)
        zip_filename = f"{project_name}.zip"

    zip_path = os.path.join(output_dir, zip_filename)

    print(f"Project directory: {project_dir}")
    print(f"Output directory: {output_dir}")
    print(f"Output zip: {zip_path}")
    print(f"Ignore patterns: {len(ignore_patterns)} patterns loaded")

    # Create the zip file
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_dir):
            # Filter out ignored directories
            dirs_to_remove = []
            for d in dirs:
                dir_path = os.path.join(root, d)
                if should_ignore(dir_path, project_dir, ignore_patterns):
                    dirs_to_remove.append(d)

            for d in dirs_to_remove:
                dirs.remove(d)

            # Process files
            for file in files:
                file_path = os.path.join(root, file)

                if should_ignore(file_path, project_dir, ignore_patterns):
                    print(f"Skipping: {os.path.relpath(file_path, project_dir)}")
                    continue

                # Calculate arcname for zip (relative path from project directory)
                arcname = os.path.relpath(file_path, project_dir)
                zipf.write(file_path, arcname)
                print(f"Added: {arcname}")

    print(f"\nSuccessfully created: {zip_path}")


if __name__ == '__main__':
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Project directory is one level up from scripts folder
    project_dir = os.path.dirname(script_dir)
    # Output directory (two levels above project, i.e., workspace root)
    # scripts/zip-project.py -> workspace-root/project
    # We want to zip project and save at workspace-root (one level above project)
    output_dir = os.path.dirname(project_dir)

    zip_project(project_dir, output_dir)
