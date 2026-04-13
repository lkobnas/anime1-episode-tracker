document.addEventListener("DOMContentLoaded", function () {
    const DEFAULTS = {
        autoNextThreshold: 120,
        skipSeconds: 3,
        skipOpeningSeconds: 90,
    };

    const autoPlayEl = document.getElementById('autoPlay');
    const autoNextEl = document.getElementById('autoNextEpisode');
    const autoNextThresholdEl = document.getElementById('autoNextThreshold');
    const skipSecondsEl = document.getElementById('skipSeconds');
    const skipOpeningSecondsEl = document.getElementById('skipOpeningSeconds');
    const autoNextThresholdTextEl = document.getElementById('autoNextThresholdText');

    function secondsToMMSS(sec) {
        const total = Math.max(0, Math.floor(sec || 0));
        const m = Math.floor(total / 60);
        const s = total % 60;
        const mm = m.toString();
        const ss = s.toString().padStart(2, '0');
        return `${mm}:${ss}`;
    }

    // Load settings
    chrome.storage.local.get(
        ['autoPlay', 'autoNextEpisode', 'options'],
        function (settings) {
            autoPlayEl.checked = settings.autoPlay || false;
            autoNextEl.checked = settings.autoNextEpisode || false;

            const options = settings.options || {};
            const thresholdSeconds =
                options.autoNextThreshold ?? DEFAULTS.autoNextThreshold;

            autoNextThresholdEl.value = thresholdSeconds;
            if (autoNextThresholdTextEl) {
                autoNextThresholdTextEl.textContent = secondsToMMSS(thresholdSeconds);
            }

            skipSecondsEl.value =
                options.skipSeconds ?? DEFAULTS.skipSeconds;
            skipOpeningSecondsEl.value =
                options.skipOpeningSeconds ?? DEFAULTS.skipOpeningSeconds;
        }
    );

    // Add event listeners for checkboxes
    autoPlayEl.addEventListener('change', function (e) {
        chrome.storage.local.set({ autoPlay: e.target.checked });
    });

    autoNextEl.addEventListener('change', function (e) {
        chrome.storage.local.set({ autoNextEpisode: e.target.checked });
    });

    function saveNumericOptions() {
        const autoNextThreshold = parseInt(autoNextThresholdEl.value, 10);
        const skipSeconds = parseInt(skipSecondsEl.value, 10);
        const skipOpeningSeconds = parseInt(skipOpeningSecondsEl.value, 10);

        const options = {};
        if (!isNaN(autoNextThreshold)) {
            options.autoNextThreshold = autoNextThreshold;
            if (autoNextThresholdTextEl) {
                autoNextThresholdTextEl.textContent = secondsToMMSS(autoNextThreshold);
            }
        }
        if (!isNaN(skipSeconds)) options.skipSeconds = skipSeconds;
        if (!isNaN(skipOpeningSeconds)) options.skipOpeningSeconds = skipOpeningSeconds;

        chrome.storage.local.set({ options });
    }

    [autoNextThresholdEl, skipSecondsEl, skipOpeningSecondsEl].forEach((el) => {
        el.addEventListener('change', saveNumericOptions);
        el.addEventListener('blur', saveNumericOptions);
    });

    // Add event listener for clear data button
    document.getElementById('clearData').addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const url = new URL(tabs[0].url);
            const animeId = url.pathname.split('/').filter(segment => segment).pop();

            chrome.storage.local.get('animeData', (result) => {
                if (result.animeData && result.animeData[animeId]) {
                    delete result.animeData[animeId];
                    chrome.storage.local.set({ animeData: result.animeData }, () => {
                        // Update the display
                        document.getElementById("animeTitle").textContent = "No data";
                        document.getElementById("episodeNumber").textContent = "No data";
                        document.getElementById("remainingTime").textContent = "No data";
                    });
                }
            });
        });
    });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        // Get the current URL and extract the anime ID
        const url = new URL(tabs[0].url);
        const animeId = url.pathname.split('/').filter(segment => segment).pop();

        // Get the anime data from storage
        chrome.storage.local.get('animeData', (result) => {
            let animeTitle = document.getElementById("animeTitle");
            let episodeNumber = document.getElementById("episodeNumber");
            let remainingTime = document.getElementById("remainingTime");

            if (animeTitle && episodeNumber && remainingTime) {
                if (result.animeData && result.animeData[animeId]) {
                    const animeData = result.animeData[animeId];
                    animeTitle.textContent = animeData.title || "Unknown";
                    episodeNumber.textContent = animeData.episode || "Unknown";
                    remainingTime.textContent = animeData.remainingTime || "Unknown";
                } else {
                    animeTitle.textContent = "No data";
                    episodeNumber.textContent = "No data";
                    remainingTime.textContent = "No data";
                }
            }
        });
    });
});
