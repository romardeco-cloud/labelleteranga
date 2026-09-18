"use client";

import { useParams } from "next/navigation";
import DocumentForm from "@/components/documents/DocumentForm";
import { DOC_CONFIG, DocType } from "@/lib/documents";

export default function NewDocumentPage() {
  const { type } = useParams<{ type: string }>();
  if (!DOC_CONFIG[type as DocType]) return <p>Type de document inconnu.</p>;
  return <DocumentForm type={type as DocType} />;
}
