import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_MESSAGES } from "@/lib/admin/types";

const mocks = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/actions/admin/sign-in", () => ({ signIn: mocks.signIn }));

import { LoginForm } from "./LoginForm";

beforeEach(() => {
  mocks.signIn.mockReset();
});

describe("LoginForm", () => {
  it("renders the email and password fields with their labels and the submit button", () => {
    render(<LoginForm />);

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("name", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toBeRequired();

    const password = screen.getByLabelText("Parolă");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("name", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toBeRequired();

    const button = screen.getByRole("button", { name: "Intră" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the action's message in an error notice and marks the fields it names", async () => {
    mocks.signIn.mockResolvedValue({
      status: "error",
      message: ADMIN_MESSAGES.credentials,
      fieldErrors: { email: ADMIN_MESSAGES.email },
    });
    render(<LoginForm />);

    fireEvent.submit(screen.getByRole("button", { name: "Intră" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(ADMIN_MESSAGES.credentials);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", `${email.id}-error`);
    expect(screen.getByText(ADMIN_MESSAGES.email)).toHaveAttribute("id", `${email.id}-error`);
    expect(screen.getByLabelText("Parolă")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Intră" })).toBeEnabled();
  });
});
