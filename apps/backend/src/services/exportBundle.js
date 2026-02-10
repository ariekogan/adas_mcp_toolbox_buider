/**
 * Export Bundle Creator
 *
 * Creates tar.gz archives from export file arrays.
 * Uses `archiver` for streaming tar.gz generation.
 */

import archiver from 'archiver';

/**
 * Create a tar.gz readable stream from an array of file objects.
 *
 * @param {Array<{name: string, content: string}>} files - Files to archive
 * @param {string} archiveName - Root directory name inside the archive
 * @returns {import('archiver').Archiver} Readable stream of the tar.gz data
 */
export function createTarGzStream(files, archiveName) {
  const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });

  for (const file of files) {
    archive.append(file.content, { name: `${archiveName}/${file.name}` });
  }

  archive.finalize();
  return archive;
}
