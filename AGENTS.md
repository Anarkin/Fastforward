# AGENTS

## Instructions

### Docs

- The user mainly maintains the `.md` files in the repository root: fixing what the code made stale or making small additions is fine, but suggest anything bigger, like new sections or rewrites, and ask before making it
- Use only headings and simple bullet points in `.md` files; ask before using anything more complex
- Only record things in `ARCHITECTURE.md` that are not clear from the code
- All `.md` file names are uppercase
- All `.md` files' first line should be a top-level heading matching the file name, except `README.md`, whose heading is the product name

### Development

- After changing app code and passing `npm run verify:fast`, run `npm run build`, which a running `npm run dev` also does by itself; ask the user to restart the app when it isn't running with `npm run dev`
- Cover every fix with a test that fails without it; when the bug itself can't be tested, as with layout in a real browser, move the logic behind the fix into code that can be, and test that
- Run the full `npm run verify` only when justified, as it is slow
- Check layout at fractional display scales like 125%, not only 100%, as positions between device pixels show seams and blurry edges

### Also follow

- @ARCHITECTURE.md
- @CONTRIBUTING.md
- @DEVELOPMENT.md
- @LIMITATIONS.md
