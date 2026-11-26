import { describe, expect, test } from "vitest";
import { isTestPath } from "./tests";

describe("isTestPath", () => {
  test.each([
    "src/server.test.ts",
    "web/src/App.spec.tsx",
    "e2e/review.e2e.ts",
    "src/__tests__/server.ts",
    "tests/integration/api.py",
    "src/__mocks__/fs.ts",
    "src/api.mock.ts",
    "src/mock/server.ts",
    "src/api-mock.ts",
    "src/api-mocks.ts",
    "src/mocks.ts",
    "src/main/java/com/acme/UserServiceMock.java",
    "app/src/test/kotlin/RepoMocks.kt",
    "Sources/ClockFake.swift",
    "Acme/OrderStub.cs",
    "web/src/test/fixtures.ts",
    "src/__snapshots__/App.test.tsx.snap",
    "pkg/server/server_test.go",
    "pkg/server/mock_store.go",
    "spec/models/user_spec.rb",
    "app/test_views.py",
    "conftest.py",
    "src/test-repo.ts",
    "src/setupTests.ts",
    "src/main/java/com/acme/UserServiceTest.java",
    "Acme.Tests/OrderTests.cs",
    "vitest.config.ts",
    "playwright.config.ts",
    "internal/testdata/input.json",
  ])("does match %s when it's a test or test support file", (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  test.each([
    "src/server.ts",
    "src/latest.ts",
    "src/Latest.java",
    "src/contest/entry.ts",
    "src/testimonials.tsx",
    "web/src/lib/attestation.ts",
    "docs/testing-guide.md",
    "vite.config.ts",
    "src/Button.stories.tsx",
    "src/hammock.ts",
    "src/Hammock.ts",
    "src/mockData.ts",
    "stubs/requests.pyi",
    "src/fakes/clock.ts",
  ])("does not match %s when it's regular code", (path) => {
    expect(isTestPath(path)).toBe(false);
  });
});
