"use client";

/**
 * Checkbox that submits its surrounding <form> when toggled. Used by the
 * reconciliation session page: each row is a tiny form carrying hidden
 * inputs (session/transaction ids + target state) and this checkbox — no
 * client-side state, the server action re-renders the page.
 */
export function AutoSubmitCheckbox({
  checked,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    />
  );
}
