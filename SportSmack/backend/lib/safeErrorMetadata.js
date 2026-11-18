function safeErrorMetadata(error) {
  const metadata = {};

  if (
    typeof error?.name === 'string' &&
    error.name.length <= 100
  ) {
    metadata.name = error.name;
  }

  if (
    typeof error?.code === 'string' &&
    error.code.length <= 100
  ) {
    metadata.code = error.code;
  }

  if (
    typeof error?.type === 'string' &&
    error.type.length <= 100
  ) {
    metadata.type = error.type;
  }

  if (Object.keys(metadata).length === 0) {
    metadata.name = 'Error';
  }

  return metadata;
}

module.exports = safeErrorMetadata;
