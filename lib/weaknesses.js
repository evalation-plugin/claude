// weaknesses - what a class of weakness lets somebody do, in words a leader reads.
//
// A scanner names each weakness by its CWE, the catalogue number every advisory database uses, and
// an advisory's own text is written for whoever maintains the package. A person deciding whether to
// patch needs what happens if they do not, so each class the scanners commonly report is said here
// once, as what an attacker could do. A class not here says nothing, since a guessed consequence is
// worse than none.
"use strict";

const CONSEQUENCE = {
  "CWE-20": "Input the code does not check can reach parts of it that trust it, which is how most other attacks start.",
  "CWE-22": "An attacker can read or write files outside the folder the code meant to use, such as configuration or keys.",
  "CWE-74": "An attacker can inject commands or markup into output another part of the system trusts.",
  "CWE-77": "An attacker can run commands on the server.",
  "CWE-78": "An attacker can run operating system commands on the server.",
  "CWE-79": "An attacker can run script in a user's browser and act as that user, including reading their session.",
  "CWE-89": "An attacker can read, change or delete database records by injecting queries.",
  "CWE-93": "An attacker can inject extra headers or lines into a response, splitting it or setting cookies.",
  "CWE-94": "An attacker can make the application run code of their choosing.",
  "CWE-113": "An attacker can inject extra headers into a response, splitting it or setting cookies.",
  "CWE-116": "Output is not escaped for where it lands, so crafted input can change what a browser or parser does.",
  "CWE-125": "A crafted input can make the software read memory it should not, leaking data or crashing it.",
  "CWE-180": "A check runs before input is normalised, so a crafted value can pass the check and act as something else.",
  "CWE-183": "An allow list admits more than intended, letting through values it was meant to stop.",
  "CWE-190": "A number can overflow, which can corrupt memory or bypass a size check.",
  "CWE-200": "Information meant to stay private can be exposed to someone not authorised to see it.",
  "CWE-201": "Sensitive data can be sent where it should not go, such as in a response or a request to another site.",
  "CWE-248": "An unexpected error is not caught, so a crafted request can crash the service.",
  "CWE-285": "A user can reach data or actions their role should not allow.",
  "CWE-287": "An attacker can get past authentication and act as another user.",
  "CWE-295": "A certificate is not checked properly, so traffic can be intercepted or altered.",
  "CWE-345": "Data is trusted without checking where it came from, so a forged value can be accepted.",
  "CWE-346": "A request's origin is not checked properly, so another site can act on a user's behalf.",
  "CWE-347": "A signature is not checked properly, so forged data can be accepted as genuine.",
  "CWE-352": "Another site can make a signed-in user's browser perform actions without their knowledge.",
  "CWE-367": "A check and the action it guards can be separated, so the state can change in between and the check is bypassed.",
  "CWE-400": "A crafted request can consume enough resources to slow or stop the service.",
  "CWE-407": "A crafted input can make an algorithm run far longer than expected, slowing or stopping the service.",
  "CWE-416": "Memory is used after it is freed, which can crash the software or let an attacker run code.",
  "CWE-434": "An attacker can upload a file the server will run or serve as trusted content.",
  "CWE-436": "Two parts of the system read the same input differently, so an attacker can slip something past one of them.",
  "CWE-444": "A request can be smuggled past a proxy, reaching the application unchecked or poisoning other users' responses.",
  "CWE-476": "A missing value can crash the software.",
  "CWE-502": "Untrusted data is turned back into objects, which can let an attacker run code.",
  "CWE-521": "Weak passwords are accepted, which makes accounts easier to guess.",
  "CWE-524": "Sensitive data can be kept in a cache and served to the wrong person.",
  "CWE-525": "Sensitive pages can be kept in a browser or shared cache and seen by another user.",
  "CWE-601": "A link on a trusted site can send users on to an attacker's site, which makes phishing convincing.",
  "CWE-611": "A crafted document can make the parser read local files or reach internal services.",
  "CWE-613": "Sessions stay valid longer than they should, so a stolen one keeps working.",
  "CWE-636": "A failure leaves the system open when it should close, so an error becomes a way in.",
  "CWE-639": "A user can reach another user's records by changing an identifier in a request.",
  "CWE-668": "A resource is reachable by people who should not reach it.",
  "CWE-693": "A protection the code relies on can be bypassed.",
  "CWE-705": "An error takes the code down an unexpected path, which can leave it in an unsafe state.",
  "CWE-754": "An unusual condition is not handled, which can crash the service or leave it in an unsafe state.",
  "CWE-755": "An error is not handled properly, which can crash the service or leave it in an unsafe state.",
  "CWE-770": "Nothing limits how much a request can allocate, so a crafted one can exhaust memory and stop the service.",
  "CWE-776": "A crafted document can expand to consume all memory and stop the service.",
  "CWE-787": "A crafted input can make the software write outside its memory, which can let an attacker run code.",
  "CWE-798": "A credential is written into the code, so anyone who can read the code can use it.",
  "CWE-834": "A loop has no bound on how often it runs, so a crafted input can stall the service.",
  "CWE-835": "A crafted input can send the code into a loop it never leaves, stalling the service.",
  "CWE-915": "A request can set fields it should not, such as a user's role.",
  "CWE-918": "An attacker can make the server send requests to internal systems it can reach and they cannot.",
  "CWE-922": "Sensitive data is stored where others can read it.",
  "CWE-940": "The source of a message is not checked, so a forged one can be accepted.",
  "CWE-59": "An attacker can use a link to make the code read or write a file it did not mean to.",
  "CWE-184": "A deny list misses a dangerous value, so it gets through the check meant to stop it.",
  "CWE-471": "Data the code relies on staying fixed can be changed by an attacker.",
  "CWE-501": "Trusted and untrusted data are mixed, so input can be treated as if the system had vouched for it.",
  "CWE-665": "Something is used before it is set up properly, which can crash the software or leave it in an unsafe state.",
  "CWE-783": "An operator applies in an unexpected order, so a check can pass when it should fail.",
  "CWE-789": "A crafted input can make the software reserve a huge amount of memory and stop the service.",
  "CWE-1284": "A size or index in the input is not checked, so a crafted value can crash the software or stall it.",
  "CWE-1285": "An index in the input is not checked, so a crafted value can read or change the wrong data.",
  "CWE-1289": "An unusual but valid-looking input is not handled, so a crafted value can crash the software or bypass a check.",
  "CWE-1321": "An attacker can change the behaviour of shared objects in the application, which can lead to bypassed checks or code running.",
  "CWE-1333": "A crafted input can make a pattern match run for a very long time, stalling the service.",
};

// What closes each class of weakness in code, for a static analysis or secret finding. A dependency is
// closed by its upgrade, so these are the classes a rule reports in the repository's own code.
const REMEDY = {
  "CWE-20": "Check the input against what the code expects before using it, and refuse anything else.",
  "CWE-22": "Build the file path from an allowed name or an identifier, and refuse any path that leaves the intended folder.",
  "CWE-78": "Pass arguments to the command as a list, never through a shell, and never build the command from input.",
  "CWE-79": "Escape the value for where it lands in the page, or sanitise it with a library such as DOMPurify before inserting it as HTML.",
  "CWE-89": "Use parameterised queries, and never build a query by joining input into the text.",
  "CWE-94": "Remove the code that runs text as code, or limit it to a fixed set of values.",
  "CWE-200": "Remove the sensitive value from what is returned or logged.",
  "CWE-295": "Turn certificate checking back on, and trust only the certificates the service needs.",
  "CWE-312": "Encrypt the value where it is stored, or stop storing it.",
  "CWE-319": "Send the data over an encrypted connection only.",
  "CWE-327": "Replace the weak algorithm with a current one, such as AES-GCM for encryption or SHA-256 for hashing.",
  "CWE-328": "Replace the weak hash with a current one, and use a password hashing function such as bcrypt or Argon2 for passwords.",
  "CWE-330": "Use a cryptographically secure random source, such as crypto.randomBytes or the secrets module.",
  "CWE-352": "Require an anti-forgery token or a same-site cookie on every request that changes state.",
  "CWE-502": "Parse untrusted data with a format that cannot create objects, such as JSON, or verify its signature first.",
  "CWE-532": "Remove the sensitive value from the log line, or mask it.",
  "CWE-601": "Redirect only to paths on this site or to an allowed list of addresses.",
  "CWE-611": "Parse XML with external entities and DTDs turned off. In Python, use the defusedxml package in place of the xml modules.",
  "CWE-614": "Set the Secure flag on the cookie so it is only sent over encrypted connections.",
  "CWE-776": "Parse XML with entity expansion limited or turned off.",
  "CWE-798": "Revoke and reissue the credential, then load it from the environment or a secret store and remove it from the code and its history.",
  "CWE-918": "Allow outbound requests only to known addresses, and refuse internal and link-local ones.",
  "CWE-1004": "Set the HttpOnly flag on the cookie so scripts in the page cannot read it.",
  "CWE-1333": "Rewrite the pattern so it cannot backtrack without bound, or limit the length of the input it runs on.",
};

/** What closes each of these classes, once each, for the classes said here. */
function remedies(cwes) {
  return [...new Set(cwesOf(cwes).map((one) => REMEDY[one]).filter(Boolean))];
}

/** The CWE numbers in whatever form a tool gives them: "CWE-79" or "CWE-79: Improper Neutralization…". */
function cwesOf(said) {
  return [...new Set((Array.isArray(said) ? said : [said]).map((one) => String(one ?? "").match(/CWE-\d+/)?.[0]).filter(Boolean))];
}

/** What each of these classes lets somebody do, once each, for the classes said here. */
function consequences(cwes) {
  return [...new Set(cwesOf(cwes).map((one) => CONSEQUENCE[one]).filter(Boolean))];
}

module.exports = { CONSEQUENCE, REMEDY, consequences, cwesOf, remedies };
