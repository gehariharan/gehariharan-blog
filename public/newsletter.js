async function refreshSubscriberCount() {
	try {
		const response = await fetch("/api/subscriber-count");
		if (!response.ok) return;
		const { count } = await response.json();
		if (!Number.isSafeInteger(count) || count < 0) return;
		document.querySelectorAll("[data-subscriber-count]").forEach((element) => {
			element.textContent = count.toLocaleString("en-US");
		});
	} catch {
		// Keep the starting count visible if the count service is unavailable.
	}
}

function focusSignup() {
	document.getElementById("email")?.focus({ preventScroll: true });
}

document.querySelectorAll('a[href="#subscribe"]').forEach((link) => {
	link.addEventListener("click", (event) => {
		event.preventDefault();
		history.replaceState(null, "", "#subscribe");
		document.getElementById("subscribe")?.scrollIntoView({
			behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
			block: "center",
		});
		focusSignup();
	});
});
function focusSignupFromHash() {
	if (location.hash === "#subscribe") focusSignup();
}
// Initial fragment navigation can reset focus after deferred scripts execute.
if (document.readyState === "complete") {
	focusSignupFromHash();
} else {
	window.addEventListener("load", () => setTimeout(focusSignupFromHash, 0), { once: true });
}
window.addEventListener("hashchange", focusSignupFromHash);

document.getElementById("subscribe-form")?.addEventListener("submit", async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const button = form.querySelector('button[type="submit"]');
	const status = form.querySelector(".status");
	button.disabled = true;
	status.textContent = "Subscribing...";
	try {
		const response = await fetch("/api/subscribe", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: new FormData(form).get("email") }),
		});
		const result = await response.json();
		status.textContent = result.message || result.error || "Unable to subscribe right now. Please try again.";
		if (response.ok) {
			form.reset();
			await refreshSubscriberCount();
		}
	} catch {
		status.textContent = "Unable to subscribe right now. Please try again.";
	} finally {
		button.disabled = false;
	}
});

refreshSubscriberCount();
