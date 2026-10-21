"use client";

import dynamic from "next/dynamic";

/** The upload sheet's code loads only in the browser, after the page, since most visits
 * never open it. */
export const LazyUploadSheet = dynamic(() => import("./upload-sheet").then((m) => m.UploadSheet), { ssr: false });
