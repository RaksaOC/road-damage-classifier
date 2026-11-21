import numpy as np

from ml.features import N_FEATURES, extract


def squares():
    rng = np.random.default_rng(42)
    yield rng.integers(0, 256, (80, 80, 3), dtype=np.uint8)  # noise
    yield np.full((80, 80, 3), 128, dtype=np.uint8)  # perfectly flat grey: no edges at all
    yield np.zeros((80, 80, 3), dtype=np.uint8)  # black
    line = np.full((80, 80, 3), 160, dtype=np.uint8)
    line[:, 38:42] = 20  # a dark vertical line, like a longitudinal crack
    yield line


def test_length_and_no_nan():
    for sq in squares():
        x = extract(sq, photo_mean=0.5)
        assert x.shape == (N_FEATURES,) == (1769,)
        assert not np.isnan(x).any()


def test_same_square_same_numbers():
    sq = next(squares())
    assert np.array_equal(extract(sq, 0.5), extract(sq, 0.5))


def test_vertical_line_is_mostly_horizontal_gradient():
    *_, line = squares()
    gx_share, gy_share = extract(line, 0.5)[-3:-1]
    assert gx_share > 0.9 and gy_share < 0.1
