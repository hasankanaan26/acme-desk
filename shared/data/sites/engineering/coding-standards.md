# Acme Corp — Coding Standards

## General Principles

- Write code for readability first, performance second.
- Every function should do one thing and do it well.
- Keep functions under 30 lines. If a function is longer, consider splitting it.
- Use descriptive variable and function names. Avoid single-letter names except for loop counters.

## Python Standards

- Follow PEP 8 for all Python code.
- Use type hints for all function parameters and return values.
- Use f-strings for string formatting (not .format() or % formatting).
- Prefer list comprehensions over map/filter for simple transformations.
- All Python modules must have a docstring explaining their purpose.

## Code Review Process

- Every change must be submitted as a pull request with at least one reviewer.
- PRs should be small and focused. Aim for under 300 lines changed per PR.
- Reviewers must respond within 1 business day.
- Use "Request Changes" for blocking issues and "Comment" for suggestions.
- All CI checks must pass before merging.

## Testing Requirements

- All new features must include unit tests.
- Aim for at least 80% code coverage on new code.
- Integration tests are required for API endpoints.
- Tests must be runnable locally with a single command: `pytest`.

## Git Conventions

- Branch names follow the pattern: `feature/short-description` or `fix/short-description`.
- Commit messages must start with a verb in imperative mood: "Add feature", not "Added feature".
- Squash commits before merging to main.
- The main branch must always be deployable.

## Documentation

- All public APIs must have docstrings.
- Architecture decisions must be recorded as ADRs (Architecture Decision Records).
- README files must be kept up to date when functionality changes.
