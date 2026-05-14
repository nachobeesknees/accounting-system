"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Row, SelectField, TextareaField } from "@/components/ui/Field";
import { OcrUpload, ReviewBanner } from "@/components/OcrUpload";
import type { OcrExtraction } from "@/lib/ocr";
import { createContactAction, type CreateContactState } from "./actions";

const initial: CreateContactState = { error: null };

export function NewContactForm({ nextCode }: { nextCode: string }) {
  const [state, action] = useActionState(createContactAction, initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"organization" | "individual">("organization");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [showReview, setShowReview] = useState(false);

  function applyOcr(data: OcrExtraction, raw: string) {
    setOcrText(raw);
    setShowReview(true);
    if (name === "") {
      if (data.company) {
        setName(data.company);
        setKind("organization");
      } else if (data.name) {
        setName(data.name);
        setKind("individual");
      }
    }
    if (data.email && email === "") setEmail(data.email);
    if (data.phone && phone === "") setPhone(data.phone);
    if (data.address && address === "") setAddress(data.address);
  }

  return (
    <form action={action}>
      <div className="px-6 my-3.5 flex flex-col gap-3.5">
        {state.error && (
          <div
            className="rounded-md px-3 py-2 text-[12.5px]"
            style={{
              background: "var(--p-review-bg)",
              color: "var(--p-review-fg)",
              border: "1px solid var(--p-review-fg)",
            }}
          >
            {state.error}
          </div>
        )}

        <OcrUpload formType="contact" onExtracted={applyOcr} />
        {showReview && <ReviewBanner onDismiss={() => setShowReview(false)} />}
        <input type="hidden" name="ocrText" value={ocrText} />

        <Card title="Contact details">
          <div className="flex flex-col gap-3">
            <Row>
              <Field label="Code" name="code" required mono defaultValue={nextCode} />
              <Field
                label="Name"
                name="name"
                required
                placeholder="Acme LLC or John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Row>
            <Row>
              <SelectField
                label="Kind"
                name="kind"
                required
                value={kind}
                onChange={(e) => setKind(e.target.value as "organization" | "individual")}
              >
                <option value="organization">Organization</option>
                <option value="individual">Individual</option>
              </SelectField>
              <Field
                label="Email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Row>
            <Row>
              <Field
                label="Phone"
                name="phone"
                mono
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Field
                label="Address"
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Row>
            <TextareaField
              label="Notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="flex flex-col gap-1.5 pt-2">
              <span className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                Tags (a contact may carry multiple)
              </span>
              <div className="flex gap-4 flex-wrap text-[13px]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isClient" />
                  <span style={{ color: "var(--ink-2)" }}>Client</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isVendor" />
                  <span style={{ color: "var(--ink-2)" }}>Vendor</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isEmployee" />
                  <span style={{ color: "var(--ink-2)" }}>Employee</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="isIntermediary" />
                  <span style={{ color: "var(--ink-2)" }}>Intermediary</span>
                </label>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href="/contacts"
            className="px-3 py-1.5 text-[13px] rounded-md"
            style={{
              border: "1px solid var(--line-2)",
              color: "var(--ink-2)",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>
          <Button variant="primary" type="submit">
            Create contact
          </Button>
        </div>
      </div>
    </form>
  );
}
