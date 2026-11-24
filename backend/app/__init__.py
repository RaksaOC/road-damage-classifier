"""The Road Damage Classifier web API.

Layers, each only talks to the one below it:
    api.py           HTTP: routes, status codes, request/response shapes
    services.py      what the app does: analyse a photo, correct it, save/list reports
    repositories.py  SQL against Postgres, nothing else
    domain.py        the rules and shapes everything shares (classes, priority score)
    ml/predict.py    the frozen models (from notebook 13)
"""
