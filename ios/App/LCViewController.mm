#import "LCViewController.h"
#import "LCAudioEngine.h"

#include "LogicalChaosEngine.h"

#include <algorithm>
#include <sstream>

using logicalchaos::LogicalChaosEngine;

@interface LCStepButton : UIButton
@property (nonatomic) int stepIndex;
@end
@implementation LCStepButton
@end

@interface LCViewController ()
@property (nonatomic, strong) UILabel* titleLabel;
@property (nonatomic, strong) UILabel* subtitleLabel;
@property (nonatomic, strong) UILabel* statusLabel;
@property (nonatomic, strong) UILabel* selectedStepLabel;
@property (nonatomic, strong) LCAudioEngine* audioEngine;

@property (nonatomic, strong) UISlider* tempoSlider;
@property (nonatomic, strong) UILabel* tempoValueLabel;
@property (nonatomic, strong) UISlider* chaosSlider;
@property (nonatomic, strong) UILabel* chaosValueLabel;
@property (nonatomic, strong) UISlider* mutationSlider;
@property (nonatomic, strong) UILabel* mutationValueLabel;
@property (nonatomic, strong) UISlider* densitySlider;
@property (nonatomic, strong) UILabel* densityValueLabel;
@property (nonatomic, strong) UISlider* gateSlider;
@property (nonatomic, strong) UILabel* gateValueLabel;
@property (nonatomic, strong) UISlider* volumeSlider;
@property (nonatomic, strong) UILabel* volumeValueLabel;
@property (nonatomic, strong) UISlider* cutoffSlider;
@property (nonatomic, strong) UILabel* cutoffValueLabel;
@property (nonatomic, strong) UISlider* resonanceSlider;
@property (nonatomic, strong) UILabel* resonanceValueLabel;
@property (nonatomic, strong) UISlider* envSlider;
@property (nonatomic, strong) UILabel* envValueLabel;
@property (nonatomic, strong) UISlider* decaySlider;
@property (nonatomic, strong) UILabel* decayValueLabel;
@property (nonatomic, strong) UISlider* stepNoteSlider;
@property (nonatomic, strong) UILabel* stepNoteValueLabel;

@property (nonatomic, strong) UISegmentedControl* patternLengthControl;
@property (nonatomic, strong) UISegmentedControl* timeSigControl;
@property (nonatomic, strong) UISegmentedControl* rootControl;
@property (nonatomic, strong) UISegmentedControl* styleControl;
@property (nonatomic, strong) UISegmentedControl* scaleControl;
@property (nonatomic, strong) UISegmentedControl* complexityControl;
@property (nonatomic, strong) UISegmentedControl* progressionControl;
@property (nonatomic, strong) UISegmentedControl* shapeControl;
@property (nonatomic, strong) UISegmentedControl* waveformControl;

@property (nonatomic, strong) UIStackView* gridStack;
@property (nonatomic, strong) NSMutableArray<LCStepButton*>* stepButtons;
@property (nonatomic, strong) UIButton* activeButton;
@property (nonatomic, strong) UIButton* glideButton;
@property (nonatomic, strong) UIButton* randomButton;
@end

@implementation LCViewController
{
    LogicalChaosEngine engine_;
    int selectedStep_;
    int visibleLength_;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    selectedStep_ = 0;
    visibleLength_ = 16;
    self.stepButtons = [NSMutableArray array];

    self.view.backgroundColor = [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0];

    UIScrollView* scroll = [[UIScrollView alloc] init];
    scroll.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:scroll];

    UIStackView* root = [[UIStackView alloc] init];
    root.translatesAutoresizingMaskIntoConstraints = NO;
    root.axis = UILayoutConstraintAxisVertical;
    root.spacing = 14.0;
    root.layoutMarginsRelativeArrangement = YES;
    root.layoutMargins = UIEdgeInsetsMake (22, 14, 22, 14);
    [scroll addSubview:root];

    [NSLayoutConstraint activateConstraints:@[
        [scroll.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor],
        [scroll.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor],
        [scroll.trailingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.trailingAnchor],
        [scroll.bottomAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.bottomAnchor],
        [root.topAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.topAnchor],
        [root.leadingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.leadingAnchor],
        [root.trailingAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.trailingAnchor],
        [root.bottomAnchor constraintEqualToAnchor:scroll.contentLayoutGuide.bottomAnchor],
        [root.widthAnchor constraintEqualToAnchor:scroll.frameLayoutGuide.widthAnchor]
    ]];

    [self buildHeaderInto:root];
    [self buildTransportInto:root];
    [self buildMusicalControlsInto:root];
    [self buildPerformanceControlsInto:root];
    [self buildSynthControlsInto:root];
    [self buildStepGridInto:root];
    [self buildStepEditorInto:root];

    engine_.resetToDefaults();
    self.audioEngine = [[LCAudioEngine alloc] initWithEngine:&engine_];
    [self applyAllControlsToEngineAndRegenerate:YES];
    [self refreshEverythingWithStatus:@"Generated 64-step default melody."];
}

- (void)buildHeaderInto:(UIStackView*)root
{
    self.titleLabel = [[UILabel alloc] init];
    self.titleLabel.text = @"LOGICAL CHAOS";
    self.titleLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    self.titleLabel.font = [UIFont systemFontOfSize:30 weight:UIFontWeightBlack];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.titleLabel];

    self.subtitleLabel = [[UILabel alloc] init];
    self.subtitleLabel.text = @"Melody Machine · iOS Standalone";
    self.subtitleLabel.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    self.subtitleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightBold];
    self.subtitleLabel.textAlignment = NSTextAlignmentCenter;
    [root addArrangedSubview:self.subtitleLabel];

    self.statusLabel = [[UILabel alloc] init];
    self.statusLabel.text = @"Ready";
    self.statusLabel.textColor = [UIColor colorWithRed:1.0 green:0.48 blue:1.0 alpha:0.90];
    self.statusLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBold];
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    self.statusLabel.numberOfLines = 2;
    [root addArrangedSubview:self.statusLabel];
}

- (void)buildTransportInto:(UIStackView*)root
{
    UIStackView* row1 = [self horizontalButtons];
    [row1 addArrangedSubview:[self makeButton:@"PLAY" action:@selector(playTapped) primary:YES]];
    [row1 addArrangedSubview:[self makeButton:@"STOP" action:@selector(stopTapped) primary:NO]];
    [row1 addArrangedSubview:[self makeButton:@"GENERATE" action:@selector(generateTapped) primary:NO]];

    UIStackView* row2 = [self horizontalButtons];
    [row2 addArrangedSubview:[self makeButton:@"MUTATE" action:@selector(mutateTapped) primary:NO]];
    [row2 addArrangedSubview:[self makeButton:@"CLEAR" action:@selector(clearTapped) primary:NO]];
    [row2 addArrangedSubview:[self makeButton:@"REFRESH" action:@selector(refreshTapped) primary:NO]];

    UIStackView* stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 8.0;
    [stack addArrangedSubview:row1];
    [stack addArrangedSubview:row2];
    [root addArrangedSubview:[self panelWithTitle:@"Transport" content:stack]];
}

- (void)buildMusicalControlsInto:(UIStackView*)root
{
    UIStackView* controls = [self verticalControls];

    self.patternLengthControl = [self segmented:@[@"8", @"16", @"32", @"64"] action:@selector(patternLengthChanged:)];
    self.patternLengthControl.selectedSegmentIndex = 1;
    [controls addArrangedSubview:[self labelledControl:@"Steps" control:self.patternLengthControl]];

    self.timeSigControl = [self segmented:@[@"4/4", @"3/4", @"6/8", @"7/8"] action:@selector(timeSignatureChanged:)];
    self.timeSigControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Time Signature" control:self.timeSigControl]];

    self.rootControl = [self segmented:@[@"C3", @"D3", @"E3", @"F3", @"G3", @"A3", @"C4"] action:@selector(rootChanged:)];
    self.rootControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Root Note" control:self.rootControl]];

    self.styleControl = [self segmented:@[@"Auto", @"Classical", @"Pop", @"Ambient", @"Synth", @"Trap"] action:@selector(styleChanged:)];
    self.styleControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Style" control:self.styleControl]];

    self.scaleControl = [self segmented:@[@"Major", @"Minor", @"Dorian", @"Pent", @"Blues", @"Chrom"] action:@selector(scaleChanged:)];
    self.scaleControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Scale" control:self.scaleControl]];

    self.complexityControl = [self segmented:@[@"Simple", @"Nice", @"Adv", @"Wild"] action:@selector(complexityChanged:)];
    self.complexityControl.selectedSegmentIndex = 1;
    [controls addArrangedSubview:[self labelledControl:@"Complexity" control:self.complexityControl]];

    self.progressionControl = [self segmented:@[@"Auto", @"Pop", @"I-IV-V", @"Epic", @"Dark", @"ii-V"] action:@selector(progressionChanged:)];
    self.progressionControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Progression" control:self.progressionControl]];

    self.shapeControl = [self segmented:@[@"Auto", @"Rise", @"Fall", @"Arch", @"Wave", @"Call"] action:@selector(shapeChanged:)];
    self.shapeControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Shape" control:self.shapeControl]];

    [root addArrangedSubview:[self panelWithTitle:@"Melody Brain" content:controls]];
}

- (void)buildPerformanceControlsInto:(UIStackView*)root
{
    UIStackView* controls = [self verticalControls];

    self.tempoSlider = [self makeSliderMin:50 max:220 value:120 action:@selector(tempoChanged:)];
    self.tempoValueLabel = [self valueLabel:@"120 BPM"];
    [controls addArrangedSubview:[self sliderRow:@"Tempo" slider:self.tempoSlider value:self.tempoValueLabel]];

    self.chaosSlider = [self makeSliderMin:0 max:100 value:35 action:@selector(chaosChanged:)];
    self.chaosValueLabel = [self valueLabel:@"35%"];
    [controls addArrangedSubview:[self sliderRow:@"Chaos" slider:self.chaosSlider value:self.chaosValueLabel]];

    self.mutationSlider = [self makeSliderMin:0 max:100 value:20 action:@selector(mutationChanged:)];
    self.mutationValueLabel = [self valueLabel:@"20%"];
    [controls addArrangedSubview:[self sliderRow:@"Mutation" slider:self.mutationSlider value:self.mutationValueLabel]];

    self.densitySlider = [self makeSliderMin:0 max:100 value:78 action:@selector(densityChanged:)];
    self.densityValueLabel = [self valueLabel:@"78%"];
    [controls addArrangedSubview:[self sliderRow:@"Density" slider:self.densitySlider value:self.densityValueLabel]];

    self.gateSlider = [self makeSliderMin:5 max:100 value:72 action:@selector(gateChanged:)];
    self.gateValueLabel = [self valueLabel:@"72%"];
    [controls addArrangedSubview:[self sliderRow:@"Gate" slider:self.gateSlider value:self.gateValueLabel]];

    self.volumeSlider = [self makeSliderMin:0 max:100 value:80 action:@selector(volumeChanged:)];
    self.volumeValueLabel = [self valueLabel:@"80%"];
    [controls addArrangedSubview:[self sliderRow:@"Master" slider:self.volumeSlider value:self.volumeValueLabel]];

    [root addArrangedSubview:[self panelWithTitle:@"Performance" content:controls]];
}

- (void)buildSynthControlsInto:(UIStackView*)root
{
    UIStackView* controls = [self verticalControls];

    self.waveformControl = [self segmented:@[@"Saw", @"Square", @"Tri", @"Sine"] action:@selector(waveformChanged:)];
    self.waveformControl.selectedSegmentIndex = 0;
    [controls addArrangedSubview:[self labelledControl:@"Waveform" control:self.waveformControl]];

    self.cutoffSlider = [self makeSliderMin:50 max:5000 value:800 action:@selector(cutoffChanged:)];
    self.cutoffValueLabel = [self valueLabel:@"800"];
    [controls addArrangedSubview:[self sliderRow:@"Cutoff" slider:self.cutoffSlider value:self.cutoffValueLabel]];

    self.resonanceSlider = [self makeSliderMin:10 max:95 value:60 action:@selector(resonanceChanged:)];
    self.resonanceValueLabel = [self valueLabel:@"0.60"];
    [controls addArrangedSubview:[self sliderRow:@"Res" slider:self.resonanceSlider value:self.resonanceValueLabel]];

    self.envSlider = [self makeSliderMin:0 max:5000 value:2000 action:@selector(envChanged:)];
    self.envValueLabel = [self valueLabel:@"2000"];
    [controls addArrangedSubview:[self sliderRow:@"Env" slider:self.envSlider value:self.envValueLabel]];

    self.decaySlider = [self makeSliderMin:5 max:200 value:30 action:@selector(decayChanged:)];
    self.decayValueLabel = [self valueLabel:@"0.30"];
    [controls addArrangedSubview:[self sliderRow:@"Decay" slider:self.decaySlider value:self.decayValueLabel]];

    [root addArrangedSubview:[self panelWithTitle:@"Synth" content:controls]];
}

- (void)buildStepGridInto:(UIStackView*)root
{
    self.gridStack = [[UIStackView alloc] init];
    self.gridStack.axis = UILayoutConstraintAxisVertical;
    self.gridStack.spacing = 7.0;
    [root addArrangedSubview:[self panelWithTitle:@"Step Grid" content:self.gridStack]];
    [self rebuildStepGrid];
}

- (void)buildStepEditorInto:(UIStackView*)root
{
    UIStackView* editor = [self verticalControls];

    self.selectedStepLabel = [[UILabel alloc] init];
    self.selectedStepLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    self.selectedStepLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightBlack];
    self.selectedStepLabel.textAlignment = NSTextAlignmentCenter;
    [editor addArrangedSubview:self.selectedStepLabel];

    UIStackView* toggles = [self horizontalButtons];
    self.activeButton = [self makeButton:@"ACTIVE" action:@selector(activeTapped) primary:NO];
    self.glideButton = [self makeButton:@"GLIDE" action:@selector(glideTapped) primary:NO];
    self.randomButton = [self makeButton:@"RANDOM" action:@selector(randomTapped) primary:NO];
    [toggles addArrangedSubview:self.activeButton];
    [toggles addArrangedSubview:self.glideButton];
    [toggles addArrangedSubview:self.randomButton];
    [editor addArrangedSubview:toggles];

    self.stepNoteSlider = [self makeSliderMin:36 max:84 value:48 action:@selector(stepNoteChanged:)];
    self.stepNoteValueLabel = [self valueLabel:@"C3"];
    [editor addArrangedSubview:[self sliderRow:@"Note" slider:self.stepNoteSlider value:self.stepNoteValueLabel]];

    [root addArrangedSubview:[self panelWithTitle:@"Step Editor" content:editor]];
}

- (void)rebuildStepGrid
{
    for (UIView* v in self.gridStack.arrangedSubviews)
    {
        [self.gridStack removeArrangedSubview:v];
        [v removeFromSuperview];
    }
    [self.stepButtons removeAllObjects];

    const int columns = 8;
    const int rows = (visibleLength_ + columns - 1) / columns;

    for (int r = 0; r < rows; ++r)
    {
        UIStackView* row = [[UIStackView alloc] init];
        row.axis = UILayoutConstraintAxisHorizontal;
        row.spacing = 6.0;
        row.distribution = UIStackViewDistributionFillEqually;
        [self.gridStack addArrangedSubview:row];

        for (int c = 0; c < columns; ++c)
        {
            int idx = r * columns + c;
            if (idx >= visibleLength_)
            {
                UIView* spacer = [[UIView alloc] init];
                [row addArrangedSubview:spacer];
                continue;
            }

            LCStepButton* button = [LCStepButton buttonWithType:UIButtonTypeSystem];
            button.stepIndex = idx;
            button.titleLabel.numberOfLines = 3;
            button.titleLabel.textAlignment = NSTextAlignmentCenter;
            button.titleLabel.font = [UIFont monospacedDigitSystemFontOfSize:10 weight:UIFontWeightBlack];
            button.layer.cornerRadius = 10.0;
            button.layer.borderWidth = 1.0;
            button.contentEdgeInsets = UIEdgeInsetsMake (8, 2, 8, 2);
            [button.heightAnchor constraintEqualToConstant:64.0].active = YES;
            [button addTarget:self action:@selector(stepTapped:) forControlEvents:UIControlEventTouchUpInside];
            [self.stepButtons addObject:button];
            [row addArrangedSubview:button];
        }
    }
}

- (void)refreshEverythingWithStatus:(NSString*)status
{
    self.statusLabel.text = status;
    [self refreshGrid];
    [self refreshStepEditor];
}

- (void)refreshGrid
{
    for (LCStepButton* b in self.stepButtons)
    {
        int i = b.stepIndex;
        const auto& s = engine_.getStep (i);
        NSString* note = [self midiNoteName:s.note];
        NSString* flags = [NSString stringWithFormat:@"%@%@", s.glide ? @"G" : @"-", s.randomise ? @"R" : @"-"];
        [b setTitle:[NSString stringWithFormat:@"%02d\n%@\n%@", i + 1, s.active ? note : @"OFF", flags] forState:UIControlStateNormal];

        UIColor* bg = s.active ? [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.13] : [UIColor colorWithWhite:1.0 alpha:0.045];
        UIColor* border = s.active ? [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.35] : [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.12];

        if (i == selectedStep_)
        {
            bg = [UIColor colorWithRed:1.0 green:0.0 blue:1.0 alpha:0.22];
            border = [UIColor colorWithRed:1.0 green:0.0 blue:1.0 alpha:0.72];
        }

        b.backgroundColor = bg;
        b.layer.borderColor = border.CGColor;
        [b setTitleColor:[UIColor colorWithWhite:0.92 alpha:1.0] forState:UIControlStateNormal];
    }
}

- (void)refreshStepEditor
{
    const auto& s = engine_.getStep (selectedStep_);
    self.selectedStepLabel.text = [NSString stringWithFormat:@"STEP %02d  ·  %@", selectedStep_ + 1, [self midiNoteName:s.note]];
    self.stepNoteSlider.value = (float) s.note;
    self.stepNoteValueLabel.text = [self midiNoteName:s.note];
    [self styleToggleButton:self.activeButton title:s.active ? @"ACTIVE ON" : @"ACTIVE OFF" enabled:s.active != 0];
    [self styleToggleButton:self.glideButton title:s.glide ? @"GLIDE ON" : @"GLIDE OFF" enabled:s.glide != 0];
    [self styleToggleButton:self.randomButton title:s.randomise ? @"RANDOM ON" : @"RANDOM OFF" enabled:s.randomise != 0];
}

- (void)styleToggleButton:(UIButton*)button title:(NSString*)title enabled:(BOOL)enabled
{
    [button setTitle:title forState:UIControlStateNormal];
    button.backgroundColor = enabled ? [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0] : [UIColor colorWithWhite:1.0 alpha:0.08];
    [button setTitleColor:enabled ? [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0] : [UIColor colorWithWhite:0.92 alpha:1.0] forState:UIControlStateNormal];
}

- (void)sendSelectedStep
{
    const auto& s = engine_.getStep (selectedStep_);
    const int packed = (2 << 28)
                   | ((selectedStep_ & 255) << 20)
                   | ((s.note & 127) << 13)
                   | ((s.active & 1) << 2)
                   | ((s.glide & 1) << 1)
                   | (s.randomise & 1);
    engine_.triggerEvent ("setStepPacked", (double) packed);
    [self refreshGrid];
    [self refreshStepEditor];
}

- (void)setSelectedStepField:(NSString*)field toggle:(BOOL)toggle note:(int)note
{
    const auto& old = engine_.getStep (selectedStep_);
    int newNote = old.note;
    int active = old.active;
    int glide = old.glide;
    int randomise = old.randomise;

    if ([field isEqualToString:@"active"] && toggle) active = active ? 0 : 1;
    if ([field isEqualToString:@"glide"] && toggle) glide = glide ? 0 : 1;
    if ([field isEqualToString:@"randomise"] && toggle) randomise = randomise ? 0 : 1;
    if ([field isEqualToString:@"note"]) newNote = std::max (0, std::min (127, note));

    const int packed = (2 << 28)
                   | ((selectedStep_ & 255) << 20)
                   | ((newNote & 127) << 13)
                   | ((active & 1) << 2)
                   | ((glide & 1) << 1)
                   | (randomise & 1);
    engine_.triggerEvent ("setStepPacked", (double) packed);
    [self refreshGrid];
    [self refreshStepEditor];
}

- (UIStackView*)horizontalButtons
{
    UIStackView* row = [[UIStackView alloc] init];
    row.axis = UILayoutConstraintAxisHorizontal;
    row.spacing = 8.0;
    row.distribution = UIStackViewDistributionFillEqually;
    return row;
}

- (UIStackView*)verticalControls
{
    UIStackView* controls = [[UIStackView alloc] init];
    controls.axis = UILayoutConstraintAxisVertical;
    controls.spacing = 12.0;
    return controls;
}

- (UIView*)panelWithTitle:(NSString*)title content:(UIView*)content
{
    UIStackView* panel = [[UIStackView alloc] init];
    panel.axis = UILayoutConstraintAxisVertical;
    panel.spacing = 10.0;
    panel.layoutMarginsRelativeArrangement = YES;
    panel.layoutMargins = UIEdgeInsetsMake (14, 14, 14, 14);
    panel.backgroundColor = [UIColor colorWithRed:0.02 green:0.08 blue:0.08 alpha:0.88];
    panel.layer.cornerRadius = 16.0;
    panel.layer.borderWidth = 1.0;
    panel.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.16].CGColor;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.90];
    label.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBlack];
    [panel addArrangedSubview:label];
    [panel addArrangedSubview:content];
    return panel;
}

- (UIButton*)makeButton:(NSString*)title action:(SEL)action primary:(BOOL)primary
{
    UIButton* button = [UIButton buttonWithType:UIButtonTypeSystem];
    [button setTitle:title forState:UIControlStateNormal];
    button.titleLabel.font = [UIFont systemFontOfSize:12 weight:UIFontWeightBlack];
    button.layer.cornerRadius = 12.0;
    button.contentEdgeInsets = UIEdgeInsetsMake (12, 6, 12, 6);

    if (primary)
    {
        button.backgroundColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
        [button setTitleColor:[UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0] forState:UIControlStateNormal];
    }
    else
    {
        button.backgroundColor = [UIColor colorWithWhite:1.0 alpha:0.08];
        [button setTitleColor:[UIColor colorWithWhite:0.92 alpha:1.0] forState:UIControlStateNormal];
        button.layer.borderWidth = 1.0;
        button.layer.borderColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:0.22].CGColor;
    }

    [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return button;
}

- (UISlider*)makeSliderMin:(float)min max:(float)max value:(float)value action:(SEL)action
{
    UISlider* slider = [[UISlider alloc] init];
    slider.minimumValue = min;
    slider.maximumValue = max;
    slider.value = value;
    slider.tintColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    [slider addTarget:self action:action forControlEvents:UIControlEventValueChanged];
    return slider;
}

- (UILabel*)valueLabel:(NSString*)text
{
    UILabel* label = [[UILabel alloc] init];
    label.text = text;
    label.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    label.font = [UIFont monospacedDigitSystemFontOfSize:12 weight:UIFontWeightBlack];
    label.textAlignment = NSTextAlignmentRight;
    [label.widthAnchor constraintEqualToConstant:76.0].active = YES;
    return label;
}

- (UIView*)sliderRow:(NSString*)title slider:(UISlider*)slider value:(UILabel*)valueLabel
{
    UIStackView* row = [[UIStackView alloc] init];
    row.axis = UILayoutConstraintAxisHorizontal;
    row.spacing = 10.0;
    row.alignment = UIStackViewAlignmentCenter;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    label.font = [UIFont systemFontOfSize:11 weight:UIFontWeightBlack];
    [label.widthAnchor constraintEqualToConstant:76.0].active = YES;

    [row addArrangedSubview:label];
    [row addArrangedSubview:slider];
    [row addArrangedSubview:valueLabel];
    return row;
}

- (UISegmentedControl*)segmented:(NSArray<NSString*>*)items action:(SEL)action
{
    UISegmentedControl* control = [[UISegmentedControl alloc] initWithItems:items];
    control.selectedSegmentTintColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.80 alpha:1.0];
    [control setTitleTextAttributes:@{ NSForegroundColorAttributeName: [UIColor colorWithWhite:0.92 alpha:1.0], NSFontAttributeName: [UIFont systemFontOfSize:10 weight:UIFontWeightBold] } forState:UIControlStateNormal];
    [control setTitleTextAttributes:@{ NSForegroundColorAttributeName: [UIColor colorWithRed:0.008 green:0.067 blue:0.067 alpha:1.0], NSFontAttributeName: [UIFont systemFontOfSize:10 weight:UIFontWeightBlack] } forState:UIControlStateSelected];
    [control addTarget:self action:action forControlEvents:UIControlEventValueChanged];
    return control;
}

- (UIView*)labelledControl:(NSString*)title control:(UIView*)control
{
    UIStackView* stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 6.0;

    UILabel* label = [[UILabel alloc] init];
    label.text = title.uppercaseString;
    label.textColor = [UIColor colorWithWhite:0.82 alpha:0.70];
    label.font = [UIFont systemFontOfSize:11 weight:UIFontWeightBlack];

    [stack addArrangedSubview:label];
    [stack addArrangedSubview:control];
    return stack;
}

- (void)playTapped
{
    NSError* error = nil;
    if ([self.audioEngine startAndReturnError:&error])
    {
        self.statusLabel.text = @"Audio: playing";
        [self.audioEngine resetPlayback];
    }
    else
    {
        self.statusLabel.text = [NSString stringWithFormat:@"Audio error: %@", error.localizedDescription ?: @"unknown"];
    }
}

- (void)stopTapped
{
    [self.audioEngine stop];
    self.statusLabel.text = @"Audio: stopped";
}

- (void)generateTapped
{
    [self applyAllControlsToEngineAndRegenerate:YES];
    [self.audioEngine resetPlayback];
    [self refreshEverythingWithStatus:@"Generated new 64-step melody."];
}

- (void)mutateTapped
{
    [self applyAllControlsToEngineAndRegenerate:NO];
    engine_.triggerEvent ("mutate", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshEverythingWithStatus:@"Mutated current melody."];
}

- (void)clearTapped
{
    engine_.triggerEvent ("clearPattern", 1.0);
    [self.audioEngine resetPlayback];
    [self refreshEverythingWithStatus:@"Cleared pattern."];
}

- (void)refreshTapped
{
    [self refreshEverythingWithStatus:@"UI refreshed."];
}

- (void)stepTapped:(LCStepButton*)button
{
    selectedStep_ = button.stepIndex;
    [self refreshGrid];
    [self refreshStepEditor];
}

- (void)activeTapped { [self setSelectedStepField:@"active" toggle:YES note:0]; }
- (void)glideTapped { [self setSelectedStepField:@"glide" toggle:YES note:0]; }
- (void)randomTapped { [self setSelectedStepField:@"randomise" toggle:YES note:0]; }

- (void)stepNoteChanged:(UISlider*)slider
{
    int note = (int) std::lround (slider.value);
    [self setSelectedStepField:@"note" toggle:NO note:note];
}

- (void)tempoChanged:(UISlider*)slider
{
    int tempo = (int) std::lround (slider.value);
    self.tempoValueLabel.text = [NSString stringWithFormat:@"%d BPM", tempo];
    engine_.setParameter ("tempo", (float) tempo);
    [self.audioEngine setTempo:(float) tempo];
}

- (void)chaosChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.chaosValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("chaos", (float) value);
}

- (void)mutationChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.mutationValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("mutation", (float) value);
}

- (void)densityChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.densityValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("density", (float) value);
}

- (void)gateChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.gateValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("gate", (float) value);
}

- (void)volumeChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.volumeValueLabel.text = [NSString stringWithFormat:@"%d%%", value];
    engine_.setParameter ("masterVolume", (float) value / 100.0f);
    [self.audioEngine setMasterVolume:(float) value / 100.0f];
}

- (void)cutoffChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.cutoffValueLabel.text = [NSString stringWithFormat:@"%d", value];
    engine_.setParameter ("synthCutoff", (float) value);
    [self.audioEngine setSynthCutoff:(float) value];
}

- (void)resonanceChanged:(UISlider*)slider
{
    float value = slider.value / 100.0f;
    self.resonanceValueLabel.text = [NSString stringWithFormat:@"%.2f", value];
    engine_.setParameter ("synthRes", value);
    [self.audioEngine setSynthResonance:value];
}

- (void)envChanged:(UISlider*)slider
{
    int value = (int) std::lround (slider.value);
    self.envValueLabel.text = [NSString stringWithFormat:@"%d", value];
    engine_.setParameter ("synthEnvMod", (float) value);
}

- (void)decayChanged:(UISlider*)slider
{
    float value = slider.value / 100.0f;
    self.decayValueLabel.text = [NSString stringWithFormat:@"%.2f", value];
    engine_.setParameter ("synthDecay", value);
    [self.audioEngine setSynthDecay:value];
}

- (void)patternLengthChanged:(UISegmentedControl*)control
{
    static const int lengths[] = { 8, 16, 32, 64 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4)
    {
        visibleLength_ = lengths[index];
        engine_.setParameter ("patternLength", (float) visibleLength_);
        if (selectedStep_ >= visibleLength_) selectedStep_ = visibleLength_ - 1;
        [self rebuildStepGrid];
        [self refreshEverythingWithStatus:[NSString stringWithFormat:@"Showing %d steps from 64-step memory.", visibleLength_]];
    }
}

- (void)timeSignatureChanged:(UISegmentedControl*)control
{
    static const int nums[] = { 4, 3, 6, 7 };
    static const int dens[] = { 4, 4, 8, 8 };
    static const int lengths[] = { 16, 12, 12, 14 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4)
    {
        engine_.setParameter ("timeSigNumerator", (float) nums[index]);
        engine_.setParameter ("timeSigDenominator", (float) dens[index]);
        visibleLength_ = lengths[index];
        engine_.setParameter ("patternLength", (float) visibleLength_);
        if (visibleLength_ == 8) self.patternLengthControl.selectedSegmentIndex = 0;
        else if (visibleLength_ <= 16) self.patternLengthControl.selectedSegmentIndex = 1;
        else if (visibleLength_ <= 32) self.patternLengthControl.selectedSegmentIndex = 2;
        else self.patternLengthControl.selectedSegmentIndex = 3;
        if (selectedStep_ >= visibleLength_) selectedStep_ = visibleLength_ - 1;
        [self rebuildStepGrid];
        [self refreshEverythingWithStatus:[NSString stringWithFormat:@"Time signature set to %d/%d.", nums[index], dens[index]]];
    }
}

- (void)rootChanged:(UISegmentedControl*)control
{
    static const int roots[] = { 48, 50, 52, 53, 55, 57, 60 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 7) engine_.setParameter ("rootNote", (float) roots[index]);
}

- (void)styleChanged:(UISegmentedControl*)control
{
    static const int styles[] = { 0, 1, 2, 3, 4, 7 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 6) engine_.setParameter ("styleType", (float) styles[index]);
}

- (void)scaleChanged:(UISegmentedControl*)control
{
    static const int scales[] = { 0, 1, 3, 7, 9, 10 };
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 6) engine_.setParameter ("scaleType", (float) scales[index]);
}

- (void)complexityChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4) engine_.setParameter ("complexityType", (float) index);
}

- (void)progressionChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 6) engine_.setParameter ("progressionType", (float) index);
}

- (void)shapeChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 6) engine_.setParameter ("shapeType", (float) index);
}

- (void)waveformChanged:(UISegmentedControl*)control
{
    NSInteger index = control.selectedSegmentIndex;
    if (index >= 0 && index < 4)
    {
        engine_.setParameter ("synthWave", (float) index);
        [self.audioEngine setSynthWave:(int) index];
    }
}

- (void)applyAllControlsToEngineAndRegenerate:(BOOL)regenerate
{
    [self tempoChanged:self.tempoSlider];
    [self chaosChanged:self.chaosSlider];
    [self mutationChanged:self.mutationSlider];
    [self densityChanged:self.densitySlider];
    [self gateChanged:self.gateSlider];
    [self volumeChanged:self.volumeSlider];
    [self cutoffChanged:self.cutoffSlider];
    [self resonanceChanged:self.resonanceSlider];
    [self envChanged:self.envSlider];
    [self decayChanged:self.decaySlider];
    [self rootChanged:self.rootControl];
    [self styleChanged:self.styleControl];
    [self scaleChanged:self.scaleControl];
    [self complexityChanged:self.complexityControl];
    [self progressionChanged:self.progressionControl];
    [self shapeChanged:self.shapeControl];
    [self waveformChanged:self.waveformControl];
    engine_.setParameter ("patternLength", (float) visibleLength_);

    if (regenerate)
        engine_.triggerEvent ("generate", 1.0);
}

- (NSString*)midiNoteName:(int)note
{
    static NSArray<NSString*>* names;
    static dispatch_once_t onceToken;
    dispatch_once (&onceToken, ^{
        names = @[ @"C", @"C#", @"D", @"D#", @"E", @"F", @"F#", @"G", @"G#", @"A", @"A#", @"B" ];
    });

    int index = note % 12;
    if (index < 0) index += 12;
    int octave = (note / 12) - 1;
    return [NSString stringWithFormat:@"%@%d", names[(NSUInteger) index], octave];
}

@end
