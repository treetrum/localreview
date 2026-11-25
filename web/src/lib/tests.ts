const TEST_DIRS = new Set([
  "test",
  "tests",
  "__tests__",
  "__test__",
  "spec",
  "specs",
  "e2e",
  "cypress",
  "testdata",
  "__mocks__",
  "mocks",
  "__fixtures__",
  "fixtures",
  "__snapshots__",
]);

const TEST_FILES = [
  // foo.test.ts, foo.spec.js, foo.e2e.ts, foo.mock.ts, foo.fixtures.json, foo.snap
  /\.(test|spec|e2e|mocks?|fixtures?)\.[^.]+$/i,
  /\.snap$/i,
  // foo_test.go, foo_spec.rb, foo_mock.go, test_foo.py, mock_foo.go
  /_(test|spec|mock)\.[^.]+$/i,
  /^(test|mock)_.+\.[^.]+$/i,
  // test-utils.ts, test-setup.ts, setupTests.ts
  /^tests?-[^/]+$/i,
  /^setup-?tests?\.[^.]+$/i,
  // FooTest.java, FooTests.cs, FooSpec.scala (capitalised, so "Latest.java" doesn't match)
  /[a-z0-9](Tests?|Spec)\.[^.]+$/,
  /^conftest\.py$/,
  /^(vitest|jest|playwright|cypress|karma)\.config\.[^/]+$/i,
];

/** Whether a path looks like a test or test support file (mocks, fixtures, snapshots, test config). */
export function isTestPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts.pop() ?? "";
  if (parts.some((dir) => TEST_DIRS.has(dir.toLowerCase()))) return true;
  return TEST_FILES.some((pattern) => pattern.test(name));
}
