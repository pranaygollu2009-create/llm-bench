/* Built-in sample models with canned answers.
   Shared by the browser (so the hosted copy can run with no server)
   and readable by anyone who wants to check what the demo scores. */
export const SAMPLE_MODELS = ["Model A (precise)", "Model B (wordy)", "Model C (careless)"];

export const SAMPLE_OUTPUTS = {
  "strict-mult": {
    "Model A (precise)": "391",
    "Model B (wordy)": "Sure! 17 multiplied by 23 equals 391.",
    "Model C (careless)": "397",
  },
  "strict-batball": {
    "Model A (precise)": "0.05",
    "Model B (wordy)": "This is a classic riddle. The intuitive answer is $0.10, but the correct amount is 0.05.",
    "Model C (careless)": "0.10",
  },
  "strict-rate": {
    "Model A (precise)": "30",
    "Model B (wordy)": "The factory makes 30 cars every hour.",
    "Model C (careless)": "24",
  },
  "fmt-sentence": {
    "Model A (precise)": "Waves carve the shore beneath a silver moon.",
    "Model B (wordy)": "The ocean is vast. Salt water covers most of the world.",
    "Model C (careless)": "Waves crash loudly on rocky shores at dusk.",
  },
  "fmt-json": {
    "Model A (precise)": '{"color":"teal","number":7}',
    "Model B (wordy)": 'Here is your JSON: {"color":"teal","number":7}',
    "Model C (careless)": '{"color":"red"}',
  },
  "fmt-primes": {
    "Model A (precise)": "2, 3, 5, 7, 11",
    "Model B (wordy)": "The first five prime numbers are 2, 3, 5, 7, 11.",
    "Model C (careless)": "2, 3, 5, 7, 9",
  },
  "write-entropy": {
    "Model A (precise)": "A measure of disorder in any system",
    "Model B (wordy)": "Entropy measures disorder, randomness, and how energy spreads out.",
    "Model C (careless)": "Chaos stuff",
  },
  "write-lighthouse": {
    "Model A (precise)": "A tall man sat gloomy upon misty rock at nightfall watching six ships sail past",
    "Model B (wordy)": "A keeper climbed his tower every night, sweeping its lamp along the rocky shore.",
    "Model C (careless)": "There was a light. Boats saw it. It was very foggy out.",
  },
  "write-sky": {
    "Model A (precise)": "The air scatters sunlight. The blue light dominates our view.",
    "Model B (wordy)": "The sky looks blue because of Rayleigh scattering: short blue wavelengths scatter far more strongly than red ones, so more blue light reaches our eyes from every direction of the sky at once.",
    "Model C (careless)": "It just is blue. Air does that thing with light.",
  },
};
