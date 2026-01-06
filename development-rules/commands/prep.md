Run `npm run prep` in the agent-backend directory to check for linter and TypeScript type errors, then systematically fix all issues found:

## Execution Steps:

1. **Run the prep command**: Execute `npm run prep` (which runs `npm run lint && npm run type-check`)

2. **Analyze all errors**: Review the complete output of both ESLint and TypeScript compiler errors

3. **Fix linter errors systematically**:
   - Address @typescript-eslint/no-explicit-any errors by replacing `any` with proper types
   - Fix unused variables and imports
   - Resolve naming convention violations
   - Fix formatting and style issues
   - Address any other ESLint rule violations

4. **Fix TypeScript type errors**:
   - Resolve type mismatches and incompatibilities
   - Add missing type annotations
   - Fix incorrect generic type usage
   - Resolve module resolution issues
   - Fix import/export type errors
   - Address strict null check violations

5. **Verify fixes**: After making changes, run `npm run prep` again to ensure all errors are resolved

6. **Report results**: Summarize all fixes made and confirm that the codebase passes all linter and type checks

## Guidelines:

- **Never use `any` type**: Replace with specific types, `unknown` (with type guards), or proper generics
- **Use existing DTOs**: Leverage DTOs from `src/dtos/` for consistent typing
- **Check for duplicates**: Before adding new code, verify no similar functions exist
- **Maintain type safety**: Add explicit return types for all public methods
- **Follow project conventions**: Adhere to naming conventions and code style defined in the project's ESLint configuration

## Error Priority:

1. TypeScript compiler errors (blocks build)
2. ESLint errors (blocks prep script)
3. ESLint warnings (should be addressed but don't block)
