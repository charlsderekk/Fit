/* =========================================================
   FitAI — Gemini Interactions API
   Complete Gemini integration
   ========================================================= */


/* =========================================================
   JSON SCHEMAS
   ========================================================= */

const PLAN_SCHEMA = {
  type: "object",

  properties: {
    overview: {
      type: "string"
    },

    weeklySplit: {
      type: "array",
      items: {
        type: "string"
      }
    },

    days: {
      type: "array",

      items: {
        type: "object",

        properties: {
          day: {
            type: "string"
          },

          focus: {
            type: "string"
          },

          exercises: {
            type: "array",

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string"
                },

                sets: {
                  type: "integer"
                },

                reps: {
                  type: "string"
                }
              },

              required: [
                "name",
                "sets",
                "reps"
              ]
            }
          }
        },

        required: [
          "day",
          "focus",
          "exercises"
        ]
      }
    },

    nutrition: {
      type: "object",

      properties: {
        dailyCalories: {
          type: "integer"
        },

        proteinG: {
          type: "integer"
        },

        carbsG: {
          type: "integer"
        },

        fatG: {
          type: "integer"
        },

        mealIdeas: {
          type: "array",

          items: {
            type: "string"
          }
        }
      },

      required: [
        "dailyCalories",
        "proteinG",
        "carbsG",
        "fatG",
        "mealIdeas"
      ]
    },

    notes: {
      type: "array",

      items: {
        type: "string"
      }
    }
  },

  required: [
    "overview",
    "weeklySplit",
    "days",
    "nutrition",
    "notes"
  ]
};


/* =========================================================
   ADAPTIVE PLAN SCHEMA
   ========================================================= */

const ADAPTIVE_PLAN_SCHEMA = {
  type: "object",

  properties: {
    overview: {
      type: "string"
    },

    whatChanged: {
      type: "string"
    },

    weeklySplit: {
      type: "array",

      items: {
        type: "string"
      }
    },

    days: {
      type: "array",

      items: {
        type: "object",

        properties: {
          day: {
            type: "string"
          },

          focus: {
            type: "string"
          },

          exercises: {
            type: "array",

            items: {
              type: "object",

              properties: {
                name: {
                  type: "string"
                },

                sets: {
                  type: "integer"
                },

                reps: {
                  type: "string"
                }
              },

              required: [
                "name",
                "sets",
                "reps"
              ]
            }
          }
        },

        required: [
          "day",
          "focus",
          "exercises"
        ]
      }
    },

    nutrition: {
      type: "object",

      properties: {
        dailyCalories: {
          type: "integer"
        },

        proteinG: {
          type: "integer"
        },

        carbsG: {
          type: "integer"
        },

        fatG: {
          type: "integer"
        },

        mealIdeas: {
          type: "array",

          items: {
            type: "string"
          }
        }
      },

      required: [
        "dailyCalories",
        "proteinG",
        "carbsG",
        "fatG",
        "mealIdeas"
      ]
    },

    notes: {
      type: "array",

      items: {
        type: "string"
      }
    }
  },

  required: [
    "overview",
    "whatChanged",
    "weeklySplit",
    "days",
    "nutrition",
    "notes"
  ]
};


/* =========================================================
   CALORIE ESTIMATION SCHEMA
   ========================================================= */

const CALORIE_SCHEMA = {
  type: "object",

  properties: {
    foodName: {
      type: "string"
    },

    calories: {
      type: "integer"
    },

    proteinG: {
      type: "integer"
    },

    carbsG: {
      type: "integer"
    },

    fatG: {
      type: "integer"
    }
  },

  required: [
    "foodName",
    "calories",
    "proteinG",
    "carbsG",
    "fatG"
  ]
};


/* =========================================================
   GEMINI API CALL
   ========================================================= */

async function callGemini({
  contents,
  systemInstruction,
  jsonMode,
  responseSchema
}) {

  /* -------------------------------------------------------
     Check API key
     ------------------------------------------------------- */

  if (
    !GEMINI_API_KEY ||
    GEMINI_API_KEY === "YOUR_API_KEY_HERE" ||
    GEMINI_API_KEY === "YOUR_NEW_API_KEY_HERE" ||
    GEMINI_API_KEY === "PASTE_YOUR_GEMINI_API_KEY_HERE"
  ) {
    throw new Error(
      "No Gemini API key set. Open js/config.js and add your API key."
    );
  }


  /* -------------------------------------------------------
     Convert messages into the Interactions API's "input" shape:
     a plain string for a single user turn, or an array of
     { role, content } objects for a multi-turn conversation.
     (The old code joined everything into one "User: ...
     Assistant: ..." string, which the real API has no way to
     parse back into separate turns.)
     ------------------------------------------------------- */

  const inputMessages = contents.map((message) => {

    const role =
      message.role === "model"
        ? "model"
        : "user";

    const content =
      message.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    return { role, content };

  });

  const inputPayload =
    inputMessages.length === 1 && inputMessages[0].role === "user"
      ? inputMessages[0].content
      : inputMessages;


  /* -------------------------------------------------------
     Request body
     ------------------------------------------------------- */

  const body = {

    model: GEMINI_MODEL,

    input: inputPayload,

    generation_config: {
      temperature: 0.7,
      max_output_tokens: 4000
    }
  };


  /* -------------------------------------------------------
     System instruction
     ------------------------------------------------------- */

  if (systemInstruction) {

    body.system_instruction =
      systemInstruction;
  }


  /* -------------------------------------------------------
     JSON mode
     ------------------------------------------------------- */

  if (jsonMode && responseSchema) {

    body.response_format = {
      type: "text",
      mime_type: "application/json",
      schema: responseSchema
    };
  }


  /* -------------------------------------------------------
     API request
     ------------------------------------------------------- */

  console.log(
    "Sending request to Gemini..."
  );

  const response = await fetch(
    GEMINI_API_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },

      body: JSON.stringify(body)
    }
  );


  /* -------------------------------------------------------
     Read response
     ------------------------------------------------------- */

  const data = await response
    .json()
    .catch(() => null);


  console.log(
    "Gemini response:",
    data
  );


  /* -------------------------------------------------------
     API error
     ------------------------------------------------------- */

  if (!response.ok) {

    const errorMessage =
      data?.error?.message ||
      data?.message ||
      `Request failed (${response.status})`;

    console.error(
      "Gemini API error:",
      errorMessage
    );

    throw new Error(
      errorMessage
    );
  }


  /* -------------------------------------------------------
     Main output
     ------------------------------------------------------- */

  if (data?.output_text) {

    return data.output_text;
  }


  /* -------------------------------------------------------
     Fallback: outputs
     ------------------------------------------------------- */

  if (Array.isArray(data?.outputs)) {

    const text = data.outputs
      .filter(
        (item) =>
          item.type === "text"
      )
      .map(
        (item) =>
          item.text || ""
      )
      .join("");

    if (text) {
      return text;
    }
  }


  /* -------------------------------------------------------
     Fallback: steps
     ------------------------------------------------------- */

  if (Array.isArray(data?.steps)) {

    const text = data.steps
      .filter(
        (step) =>
          step.type === "model_output"
      )
      .flatMap(
        (step) =>
          step.content || []
      )
      .filter(
        (item) =>
          item.type === "text"
      )
      .map(
        (item) =>
          item.text || ""
      )
      .join("");

    if (text) {
      return text;
    }
  }


  throw new Error(
    "The AI returned an empty response. Please try again."
  );
}


/* =========================================================
   JSON GENERATOR
   ========================================================= */

async function generateJSON(
  promptText,
  systemInstruction
) {

  /* -------------------------------------------------------
     Choose schema
     ------------------------------------------------------- */

  let schema = PLAN_SCHEMA;


  /* Food / calorie request */

  if (
    promptText.includes(
      "food/meal description"
    ) ||

    promptText.includes(
      '"foodName"'
    ) ||

    promptText.includes(
      "nutritional content"
    )
  ) {

    schema =
      CALORIE_SCHEMA;
  }


  /* Adaptive plan */

  else if (
    promptText.includes(
      "whatChanged"
    ) ||

    promptText.includes(
      "reviewing a client's progress"
    )
  ) {

    schema =
      ADAPTIVE_PLAN_SCHEMA;
  }


  /* -------------------------------------------------------
     Ask Gemini
     ------------------------------------------------------- */

  const raw =
    await callGemini({

      contents: [
        {
          role: "user",

          parts: [
            {
              text: promptText
            }
          ]
        }
      ],

      systemInstruction,

      jsonMode: true,

      responseSchema: schema
    });


  console.log(
    "========== GEMINI RAW RESPONSE =========="
  );

  console.log(raw);

  console.log(
    "=========================================="
  );


  /* -------------------------------------------------------
     Clean response
     ------------------------------------------------------- */

  let cleaned =
    String(raw || "").trim();


  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /```\s*$/i,
        ""
      )
      .trim();


  /* -------------------------------------------------------
     Try direct JSON
     ------------------------------------------------------- */

  try {

    return JSON.parse(
      cleaned
    );

  } catch (error) {

    console.warn(
      "Direct JSON parse failed."
    );
  }


  /* -------------------------------------------------------
     Try extracting JSON object
     ------------------------------------------------------- */

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");


  if (
    firstBrace !== -1 &&
    lastBrace !== -1
  ) {

    const possibleJSON =
      cleaned.slice(
        firstBrace,
        lastBrace + 1
      );


    try {

      return JSON.parse(
        possibleJSON
      );

    } catch (error) {

      console.error(
        "Extracted JSON is invalid:",
        possibleJSON
      );
    }
  }


  /* -------------------------------------------------------
     Final error
     ------------------------------------------------------- */

  console.error(
    "FINAL GEMINI RESPONSE:",
    cleaned
  );


  throw new Error(
    "The AI returned an invalid response. Please try generating the plan again."
  );
}


/* =========================================================
   AI CHAT
   ========================================================= */

async function generateChatReply(
  history,
  systemInstruction
) {

  const contents =
    history.map(
      (message) => ({

        role:
          message.role === "model"
            ? "model"
            : "user",

        parts: [
          {
            text: message.text
          }
        ]

      })
    );


  return callGemini({

    contents,

    systemInstruction,

    jsonMode: false

  });
}


/* =========================================================
   PROFILE SUMMARY
   ========================================================= */

function profileSummaryLine(p) {

  const target =
    p.targetWeight
      ? `, target weight ${p.targetWeight} kg`
      : "";


  const limitations =
    p.limitations
      ? `Injuries/limitations: ${p.limitations}.`
      : "No reported injuries.";


  return `${p.age}-year-old, ${p.sex}, ${p.height} cm, ${p.weight} kg${target}. Goal: ${p.goal}. Experience: ${p.experience}. Available ${p.days} days/week. Equipment: ${p.equipment}. Diet preference: ${p.diet}. ${limitations}`;
}


/* =========================================================
   PLAN JSON SHAPE
   ========================================================= */

const PLAN_JSON_SHAPE = `

Return ONLY valid JSON.

Use exactly this structure:

{
  "overview": "2-3 sentence explanation",

  "weeklySplit": [
    "Day 1 — Upper Body",
    "Day 2 — Lower Body"
  ],

  "days": [
    {
      "day": "Day 1",
      "focus": "Upper Body",

      "exercises": [
        {
          "name": "Bench Press",
          "sets": 4,
          "reps": "8-10"
        }
      ]
    }
  ],

  "nutrition": {
    "dailyCalories": 2200,
    "proteinG": 150,
    "carbsG": 220,
    "fatG": 70,

    "mealIdeas": [
      "Breakfast: ...",
      "Lunch: ...",
      "Dinner: ...",
      "Snack: ..."
    ]
  },

  "notes": [
    "Progress gradually.",
    "Rest when needed."
  ]
}

IMPORTANT:
- Return JSON only.
- Do not use markdown.
- Do not add explanations outside JSON.
- Make exactly the requested number of workout days.
`;


/* =========================================================
   INITIAL PLAN
   ========================================================= */

function buildInitialPlanPrompt(
  profile
) {

  return `

You are FitAI,
an experienced and safety-conscious
personal trainer and nutrition coach.

Create a personalized workout
and nutrition plan.

CLIENT PROFILE:

${profileSummaryLine(profile)}

REQUIREMENTS:

Create exactly ${profile.days}
training days.

Consider:

- Age
- Sex
- Height
- Weight
- Target weight
- Fitness goal
- Experience
- Available gym days
- Equipment
- Diet preference
- Injuries or limitations

Match exercises to the person's
experience and equipment.

Nutrition should be realistic.

Do not recommend dangerous
or extreme diets.

${PLAN_JSON_SHAPE}

`;
}


/* =========================================================
   ADAPTIVE PLAN
   ========================================================= */

function buildAdaptivePlanPrompt(
  profile,
  previousPlan,
  progressSummary
) {

  return `

You are FitAI,
an experienced personal trainer
reviewing a client's progress.

CLIENT PROFILE:

${profileSummaryLine(profile)}

CURRENT PLAN:

${previousPlan.overview}

PROGRESS:

${progressSummary}

Create an updated workout
and nutrition plan.

Keep approximately the same
number of training days.

Explain what changed using
the "whatChanged" field.

Return ONLY valid JSON.

Use this structure:

{
  "overview": "...",

  "whatChanged": "...",

  "weeklySplit": [
    "..."
  ],

  "days": [
    {
      "day": "Day 1",
      "focus": "...",

      "exercises": [
        {
          "name": "...",
          "sets": 4,
          "reps": "8-10"
        }
      ]
    }
  ],

  "nutrition": {
    "dailyCalories": 2200,
    "proteinG": 150,
    "carbsG": 220,
    "fatG": 70,

    "mealIdeas": [
      "..."
    ]
  },

  "notes": [
    "..."
  ]
}

Return JSON only.
No markdown.
No extra explanation.

`;
}


/* =========================================================
   CALORIE ESTIMATION
   ========================================================= */

function buildCalorieEstimatePrompt(
  description
) {

  return `

You are FitAI's food tracking assistant.

Estimate the nutritional content
of this food or meal:

"${description}"

Use a realistic estimate based
on a typical serving if the amount
is not specified.

Return ONLY valid JSON.

Use exactly this structure:

{
  "foodName": "short food name",
  "calories": 450,
  "proteinG": 30,
  "carbsG": 40,
  "fatG": 15
}

Rules:

- Numbers only for calories and macros.
- No units inside numbers.
- No markdown.
- No explanation outside JSON.

`;
}


/* =========================================================
   CHAT SYSTEM INSTRUCTION
   ========================================================= */

function buildChatSystemInstruction(
  profile,
  contextSummary
) {

  return `

You are FitAI,
a supportive fitness and nutrition
coach inside a fitness application.

Speak directly to the user.

Keep answers:

- Friendly
- Clear
- Practical
- Beginner-friendly
- Fairly short

Help the user with:

- Gym schedules
- Workout exercises
- Sets and reps
- Rest days
- Nutrition
- Calories
- Protein
- Weight goals
- Exercise form
- Motivation
- Fitness questions

Do not recommend dangerous
or extreme diets.

You are not a doctor.

For injuries, serious symptoms,
or medical concerns, recommend
consulting a qualified healthcare
professional.

CLIENT PROFILE:

${profileSummaryLine(profile)}

CURRENT APP CONTEXT:

${contextSummary}

`;
}