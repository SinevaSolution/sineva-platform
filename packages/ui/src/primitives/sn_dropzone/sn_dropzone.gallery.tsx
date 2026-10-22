'use client';

import * as React from 'react';
import { SNDropzone } from './sn_dropzone';

const messages = {
  type: 'Choose a PDF or text file.',
  size: 'Choose a nonempty file up to 25 MB.',
  count: 'Choose one file at a time.',
};

export function SNDropzoneGallery() {
  const [single, setSingle] = React.useState<File[]>([]);
  const [several, setSeveral] = React.useState<File[]>([]);
  return (
    <section aria-labelledby="gallery-sn-dropzone" className="max-w-md space-y-4">
      <h2 id="gallery-sn-dropzone" className="text-lg font-semibold text-text">
        SNDropzone
      </h2>
      <SNDropzone
        label="Drop a file here or click to browse"
        hint="PDF or TXT, up to 25 MB."
        value={single}
        onFilesChange={setSingle}
        accept=".pdf,.txt"
        maxBytes={25 * 1024 * 1024}
        messages={messages}
      />
      <SNDropzone
        label="Drop files here or click to browse"
        hint="Several PDF or TXT files, each up to 25 MB."
        multiple
        value={several}
        onFilesChange={(files) => setSeveral((current) => [...current, ...files])}
        accept=".pdf,.txt"
        maxBytes={25 * 1024 * 1024}
        messages={{ type: messages.type, size: messages.size }}
      />
      <SNDropzone label="Invalid" aria-invalid onFilesChange={() => {}} messages={messages} />
      <SNDropzone
        label="Uploads unavailable"
        value={[]}
        onFilesChange={setSingle}
        disabled
        messages={messages}
      />
    </section>
  );
}
