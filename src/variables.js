const DEFAULT_VALUES = {
  display_time:'00:00', seconds:0, duration:0, status:'READY', start_pause_label:'START', connection_status:'OFFLINE',
  running:'no', paused:'no', overtime:'no', warning:'no', warning_label:'',
  queue_length:0, current_cue_number:0, queue_position:'Cue 0 of 0', current_cue_label:'', current_cue_duration:0,
  next_cue_label:'', next_cue_duration:0, has_next_cue:'no',
  presenter_message:'', banner_text:'', banner_visible:'yes', flash_timer:'no', flash_message:'no',
  warnings_enabled:'yes', progress_enabled:'no', gradient_enabled:'yes', shadow_enabled:'yes', chroma_enabled:'no',
  remote_viewers:0, browser_online:'no'
}

module.exports = function(self) {
  self.variableDefaults = { ...DEFAULT_VALUES }
  self.setVariableDefinitions([
    {variableId:'display_time',name:'Live timer display'}, {variableId:'seconds',name:'Live timer seconds'}, {variableId:'duration',name:'Loaded duration seconds'},
    {variableId:'status',name:'Timer state'}, {variableId:'start_pause_label',name:'START / PAUSE live label'}, {variableId:'connection_status',name:'Timer connection'},
    {variableId:'running',name:'Running yes/no'}, {variableId:'paused',name:'Paused yes/no'}, {variableId:'overtime',name:'Overtime yes/no'},
    {variableId:'warning',name:'Warning active yes/no'}, {variableId:'warning_label',name:'Current warning label'},
    {variableId:'queue_length',name:'Total cue count'}, {variableId:'current_cue_number',name:'Current cue number'}, {variableId:'queue_position',name:'Queue position, e.g. Cue 2 of 20'},
    {variableId:'current_cue_label',name:'Current cue label'}, {variableId:'current_cue_duration',name:'Current cue duration seconds'},
    {variableId:'next_cue_label',name:'Next cue label'}, {variableId:'next_cue_duration',name:'Next cue duration seconds'}, {variableId:'has_next_cue',name:'Has next cue yes/no'},
    {variableId:'presenter_message',name:'Current presenter message'}, {variableId:'banner_text',name:'Text currently intended for banner'}, {variableId:'banner_visible',name:'Banner visible yes/no'},
    {variableId:'flash_timer',name:'Flash timer yes/no'}, {variableId:'flash_message',name:'Flash message yes/no'},
    {variableId:'warnings_enabled',name:'Warnings enabled yes/no'}, {variableId:'progress_enabled',name:'Progress bar enabled yes/no'}, {variableId:'gradient_enabled',name:'Gradient enabled yes/no'},
    {variableId:'shadow_enabled',name:'Drop shadow enabled yes/no'}, {variableId:'chroma_enabled',name:'Chroma enabled yes/no'},
    {variableId:'remote_viewers',name:'Connected remote viewer/device count'}, {variableId:'browser_online',name:'Timer browser connected yes/no'}
  ])
  self.setVariableValues(DEFAULT_VALUES)
}
module.exports.DEFAULT_VALUES = DEFAULT_VALUES
