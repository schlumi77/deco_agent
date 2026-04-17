import pytest
import io
from unittest.mock import patch, MagicMock

# These scripts execute code on import, so we need to be careful.
# We'll mock stdout and data loading to avoid side effects during import.

@pytest.fixture(autouse=True)
def mock_deko_data():
    with patch('deko_agent.load_gases', return_value=[
        {'name': 'Air', 'fO2': 0.21, 'fHe': 0.0, 'type': 'bottom'},
        {'name': 'Oxygen', 'fO2': 1.0, 'fHe': 0.0, 'type': 'deco'},
        {'name': 'Tx 6/90', 'fO2': 0.06, 'fHe': 0.90, 'type': 'bottom'},
        {'name': 'Tx 50/15', 'fO2': 0.50, 'fHe': 0.15, 'type': 'deco'},
        {'name': 'Tx 15/55', 'fO2': 0.15, 'fHe': 0.55, 'type': 'bottom'}
    ]):
        with patch('deko_agent.load_cylinders', return_value=[
            {'name': 'Diluent/Bailout', 'volume': 3, 'pressure': 200}
        ]):
            yield

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_calculate_all_scenarios(mock_open, mock_stdout):
    import calculate_all_scenarios
    # Test print_scenario directly
    mock_stdout.truncate(0)
    mock_stdout.seek(0)
    calculate_all_scenarios.print_scenario("Test", 30, 10, "Air", False, 1.2, 1.2, 0.5, 0.8)
    assert "### SCENARIO: Test ###" in mock_stdout.getvalue()

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_calculate_bailout(mock_open, mock_stdout):
    import calculate_bailout
    res = calculate_bailout.run_bailout_calc(0.5, 0.8)
    assert isinstance(res, dict)
    assert "Tx 6/90" in res

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_calculate_bailout_schedule(mock_open, mock_stdout):
    import calculate_bailout_schedule
    res = calculate_bailout_schedule.generate_oc_schedule_md(0.5, 0.8)
    assert "| Depth | Stop Time | Gas |" in res

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_check_offgassing(mock_open, mock_stdout):
    import check_offgassing
    depth = check_offgassing.find_offgassing_depth(50, 20, 'Tx 15/55', True, 1.2, 1.2)
    assert depth > 0

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_generate_heatmaps(mock_open, mock_stdout):
    import generate_heatmaps
    from deco_engine import DecoEngine
    eng = DecoEngine()
    md = generate_heatmaps.make_heatmap(eng)
    assert "Tissue Saturation" in md
    assert "█" in md or "░" in md

@patch('sys.stdout', new_callable=io.StringIO)
@patch('builtins.open', new_callable=MagicMock)
def test_dump_openapi(mock_open, mock_stdout):
    import dump_openapi
    # Ensure it doesn't crash
    pass
