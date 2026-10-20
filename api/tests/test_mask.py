from app.pipeline.mask import luhn_ok, mask_ids, verhoeff_ok


def aadhaar_like(first11: str) -> str:
    """Add the Verhoeff check digit, like a real Aadhaar number has."""
    return next(first11 + d for d in "0123456789" if verhoeff_ok(first11 + d))


def test_checksums():
    assert luhn_ok("4111111111111111")
    assert not luhn_ok("4111111111111112")
    valid = aadhaar_like("23412341234")
    assert verhoeff_ok(valid)
    assert not verhoeff_ok(valid[:-1] + str((int(valid[-1]) + 1) % 10))


def test_masks_aadhaar_in_any_spacing():
    n = aadhaar_like("52341234123")
    spaced = f"{n[:4]} {n[4:8]} {n[8:]}"
    for written in (n, spaced, spaced.replace(" ", "-")):
        assert mask_ids(f"Aadhaar: {written}.") == f"Aadhaar: ●●●● {n[-4:]}."


def test_masks_pan_and_cards():
    assert mask_ids("PAN ABCPE1234F") == "PAN ●●●● 234F"
    assert mask_ids("Card 4111 1111 1111 1111 used") == "Card ●●●● 1111 used"


def test_leaves_ordinary_numbers_alone():
    n = aadhaar_like("52341234123")
    not_aadhaar = n[:-1] + str((int(n[-1]) + 1) % 10)  # fails the checksum
    text = (
        f"Invoice {not_aadhaar}, order 4111111111111112, phone 9876543210, "
        "amount 2,34,500.00, date 12/03/2025, GSTIN 27ABCDE1234F1Z5, ref INV2025ABCD1234"
    )
    assert mask_ids(text) == text
