class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        // Post the raw float32 channel data to the main thread
        this.port.postMessage(channelData);
      }
    }
    // Return true to keep the processor alive
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
