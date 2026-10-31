"use client";

import dynamic from "next/dynamic";

const Shell = dynamic(() => import("@/components/Shell"), {
  ssr: false,
  loading: () => (
    <div className="pc-splash" role="status" aria-label="Loading">
      <img src="/brand/mark-128.png" alt="" width={56} height={56} />
      <span>Personal Context Protocol</span>
    </div>
  ),
});

export default function Home() {
  return <Shell />;
}
