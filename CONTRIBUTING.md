# Contributing to Cytario Web

Thank you for your interest in contributing to Cytario Web! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies with `npm install`
4. Create a new branch for your feature or fix

## Development Setup

See the [README](README.md) for detailed setup instructions.

```sh
npm install
npm run dev
```

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

**Allowed types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Formatting, white-space, etc (no code change)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or fixing tests
- `build`: Build system or dependencies changes
- `ci`: Continuous Integration config changes
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

## Pull Request Process

1. Ensure your code follows the existing style and conventions
2. Update documentation if needed
3. Add tests for new functionality
4. Ensure all tests pass with `npm test`
5. Ensure the build succeeds with `npm run build`
6. Submit your pull request with a clear description of changes

## Code Style

- Follow the existing code patterns in the repository
- Use TypeScript for type safety
- Run linting before submitting: `npm run lint`

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment details (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 License.
