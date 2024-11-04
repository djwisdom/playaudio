// Array of audio URLs
const audioUrls = [
  "https://jking.cdnstream1.com/b75154_128mp3",
  "https://ais-edge90-dal03.cdnstream.com/b05055_128mp3",
  "https://ais-edge89-dal02.cdnstream.com/b48071_128mp3",
  "http://111.125.87.226:8000/streamfm",
  "http://sg-icecast.eradioportal.com:8000/febc_dzfe",
  "https://bigrradio.cdnstream1.com/5181_128"
];

// Populate the dropdown menu with audio options
const audioSelector = document.getElementById("audioSelector");
audioUrls.forEach((url, index) => {
  const option = document.createElement("option");
  option.value = url;
  option.textContent = `Station ${index + 1}`;
  audioSelector.appendChild(option);
});

// Function to play the selected audio URL
function playAudio() {
  const selectedUrl = audioSelector.value;
  const audioPlayer = document.getElementById("audioPlayer");
  audioPlayer.src = selectedUrl;
  audioPlayer.play();
}

// Function to update the real-time clock in 12-hour AM/PM format
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // Determine AM or PM suffix
  const ampm = hours >= 12 ? 'pm' : 'am';

  // Convert to 12-hour format
  hours = hours % 12;
  hours = hours ? hours : 12; // Show "12" instead of "0" for midnight and noon
  const formattedTime = `${hours}:${minutes}${ampm}`;

  // Display the time
  document.getElementById("clock").textContent = formattedTime;
}

// Function to update and display the human-readable date
function updateDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = now.toLocaleDateString(undefined, options);
  document.getElementById("dateDisplay").textContent = formattedDate;
}

// Start the clock and date display
setInterval(updateClock, 1000);
updateDate(); // Call once initially
