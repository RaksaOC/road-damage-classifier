# Road Damage Classifier

Upload a road photo. The model checks it square by square, names the damage in each square (longitudinal crack, transverse crack, alligator crack, pothole or none), and gives the road a repair priority.

ML course project (Fundamentals of Machine Learning). Data: [RDD2022](https://github.com/sekilab/RoadDamageDetector).

## Layout

```
main.py       entry point
src/          ML code
scripts/      data and training scripts
notebooks/    exploration and experiments
app/          web app
tests/        tests
data/         raw/ and processed/ (not committed)
models/       trained models (not committed)
```

## Setup

```bash
uv sync
uv run python main.py
```
