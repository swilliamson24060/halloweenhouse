// The papers found around Ravenmoor House. All original text.

export const NOTES = {
  card: {
    title: 'A calling card',
    meta: 'Black-edged, left on the hall table',
    body: [
      'Mrs Eleanor Ravenmoor regrets that she is not at home to callers.',
      'Written beneath it, in a different hand: She is always at home. That is the whole trouble with this house.',
    ],
  },
  diary: {
    title: "Eleanor's diary",
    meta: 'October 1888',
    body: [
      "Josiah's ship is three weeks overdue. The harbourmaster will not meet my eye when I ask.",
      'I have taken to walking the roof at night. From up there the lane looks like a dark river, and every carriage lamp could be a mast light coming home.',
      'Agnes says the children have been talking to someone in the attic. I told her that all children do.',
    ],
  },
  drawing: {
    title: "A child's drawing",
    meta: 'Crayon, on the back of a sermon',
    body: [
      'THE TALL LADY SINGS TO US WHEN MAMA IS ASLEEP. SHE HAS NO FEET.',
      'THOMAS SAYS DONT LOOK AT HER FACE. I DID AND SHE WAS ONLY SAD.',
      'Underneath, much smaller: she wants us to stay and play forever.',
    ],
  },
  seance: {
    title: 'Minutes of a sitting',
    meta: 'All Hallows Eve, 1889',
    body: [
      'Present: Mrs E. Ravenmoor, Miss A. Whitby, and the medium, Madame Vey.',
      '11.40. The planchette moved before any hand was laid upon it. It spelled S, T, A, Y, eleven times over.',
      '11.52. Mrs Ravenmoor asked whether her husband was with us. The answer was NO. She asked who, then, was present. Every candle in the room went out at once.',
      '11.53. The sitting was concluded. Madame Vey left without her fee and without her coat.',
    ],
  },
  mirror: {
    title: "Eleanor's last page",
    meta: 'Undated, the ink run by water',
    body: [
      'I saw him in the glass tonight, standing behind my chair, wet through and so pale. When I turned there was only the bed.',
      'So he has come home after all, the only way that was left to him.',
      'I shall wait for him on the roof, where he will be able to see me.',
    ],
  },
  ledger: {
    title: "The housekeeper's ledger",
    meta: 'Agnes Whitby, winter 1890',
    body: [
      'Laid eight places for supper as Madam instructed, though there are only two of us left living in the house.',
      'In the morning the plates had been used. I did not wash them. I will not wash them.',
      'Bought candles, lamp oil, salt.',
    ],
  },
  caretaker: {
    title: "A caretaker's notes",
    meta: 'Ashgrove Parish, 1931',
    body: [
      'I am the third caretaker this year. The others did not give notice.',
      'Do not open the red door upstairs. Do not answer the knocking under the stairs. If the woman on the roof turns around, look at your shoes until she has gone.',
      'The house means no harm, I think. It is only lonely. That is all it has ever been.',
    ],
  },
  hymnal: {
    title: 'A page pinned to a beam',
    meta: 'Torn from the back of a hymnal',
    body: [
      'Every room remembers. The attic remembers best of all, because nobody ever comes up to make it forget.',
      'Count us, if you like. We have been counting you since the gate.',
    ],
  },
};

export const ENDING = (seen, total) =>
  `Eleanor Ravenmoor is still waiting on the roof for a ship that will never come in. Tonight, for a little while, she had company. You witnessed ${seen} of the ${total} apparitions that walk Ravenmoor House.${
    seen < total ? ' The others are still here. They will wait for you too.' : ' None of them will forget you.'
  }`;
